// ZX Spectrum 48K wasm core — a thin Embind wrapper over floooh/chips
// `systems/zx.h`. Mirrors the C64 core (wasm/c64-core.cpp) 1:1 so the RunBackend
// host stays a near-copy: frame advance, instruction step, breakpoint-granular
// trapping, Z80 register/memory inspection, keyboard input, beeper audio tap.
// The chips core is dependency-free C99; compiled here with CHIPS_IMPL in one
// translation unit (zx-impl.c) — this file pulls in declarations only.
//
// ROM: the 48K ROM is Amstrad-redistributable, so it ships (roms/48.rom) and is
// handed to the core at init() by the host — chips copies it into its own state.
//
// Loadable format is the 48K .sna snapshot (chips `zx_quickload` is a .z80
// loader and there is no tape API in this core; appmake emits .sna directly).
// loadSNA() restores the Z80 registers + 48K RAM and resumes via z80_prefetch.

#include <cstdint>
#include <cstring>
#include <vector>
#include <emscripten/bind.h>
#include <emscripten/val.h>

// chips is C99; its implementation compiles only as C (see zx-impl.c). Here we
// pull in just the declarations — no CHIPS_IMPL — under `extern "C"` so the
// names match the symbols defined by the C translation unit at link time.
extern "C" {
#include "chips/chips_common.h"
#include "chips/z80.h"
#include "chips/beeper.h"
#include "chips/ay38910.h"
#include "chips/kbd.h"
#include "chips/mem.h"
#include "chips/clk.h"
#include "systems/zx.h"
}

using emscripten::val;

namespace {

// One PAL frame in microseconds (50 Hz). zx_exec ticks the whole machine for
// this slice; the ULA renders exactly one field into the framebuffer.
constexpr uint32_t FRAME_USEC = 20000;
// Generous slice for a single-instruction step — zx_exec bails at the first
// instruction boundary long before this budget is reached.
constexpr uint32_t STEP_USEC = 100000;

// Visible ZX screen incl. border (ZX_DISPLAY_WIDTH × ZX_DISPLAY_HEIGHT). The
// chips display_info screen rect is the live source of truth for cropping;
// these only size the output buffer and clamp.
constexpr int SCREEN_W = 320;
constexpr int SCREEN_H = 256;

zx_t g_sys;
zx_t g_snapshot;   // scratch backing saveState()/loadState()
bool g_inited = false;

// RGBA8888 output cropped to the visible screen. The chips palette is already
// 0xFFBBGGRR (canvas-native little-endian RGBA), so the host blits it with a
// straight memcpy — no channel swap.
uint32_t g_out[SCREEN_W * SCREEN_H];
int g_screen_w = SCREEN_W;
int g_screen_h = SCREEN_H;

// Scratch buffer backing readMem()'s typed view.
uint8_t g_membuf[0x10000];

// Beeper audio tap (same drain model as the C64 SID / Altirra POKEY taps).
constexpr size_t AUDIO_CAP = 1 << 14;
float g_audio[AUDIO_CAP];
size_t g_audio_len = 0;
float g_audio_out[AUDIO_CAP];

// Breakpoint set, indexed by CPU address.
uint8_t g_bp[0x10000];
int g_bp_count = 0;

enum ExecMode { MODE_RUN, MODE_STEP, MODE_FRAME_BP };
ExecMode g_mode = MODE_RUN;
bool g_stopped = false;
uint16_t g_last_pc = 0;
bool g_at_boundary = false;
uint32_t g_ticks = 0;

void audio_cb(const float* samples, int num, void* /*user*/) {
    for (int i = 0; i < num; i++) {
        if (g_audio_len < AUDIO_CAP) g_audio[g_audio_len++] = samples[i];
    }
}

// Fires after every CPU tick. A Z80 opcode-fetch of a NEW instruction is an M1
// read that is not a prefix continuation (this is exactly z80_opdone's test):
//   (pins & M1|RD) == (M1|RD)  &&  !cpu.prefix_active.
// On such a fetch the address bus holds the instruction PC — latch it and apply
// the active stop policy (STEP = stop at the first one; FRAME_BP = stop when the
// PC is breakpointed). Because the fetch tick has already run, resuming
// completes the instruction and the next boundary is a different PC, so a
// breakpoint never re-traps itself in place.
void debug_cb(void* /*user*/, uint64_t pins) {
    g_ticks++;
    if (((pins & (Z80_M1 | Z80_RD)) == (Z80_M1 | Z80_RD)) && !g_sys.cpu.prefix_active) {
        g_last_pc = (uint16_t)Z80_GET_ADDR(pins);
        g_at_boundary = true;
        if (g_mode == MODE_STEP) {
            g_stopped = true;
        } else if (g_mode == MODE_FRAME_BP && g_bp_count && g_bp[g_last_pc]) {
            g_stopped = true;
        }
    } else {
        g_at_boundary = false;
    }
}

std::vector<uint8_t> vec_from_val(const val& v) {
    return emscripten::vecFromJSArray<uint8_t>(v);
}

void render() {
    chips_display_info_t info = zx_display_info(&g_sys);
    const uint8_t* fb = static_cast<const uint8_t*>(info.frame.buffer.ptr);
    const int fbw = info.frame.dim.width;
    const uint32_t* pal = static_cast<const uint32_t*>(info.palette.ptr);
    int sw = info.screen.width, sh = info.screen.height;
    const int sx = info.screen.x, sy = info.screen.y;
    if (sw > SCREEN_W) sw = SCREEN_W;
    if (sh > SCREEN_H) sh = SCREEN_H;
    for (int y = 0; y < sh; y++) {
        const uint8_t* row = fb + (sy + y) * fbw + sx;
        uint32_t* drow = g_out + y * sw;
        for (int x = 0; x < sw; x++) drow[x] = pal[row[x]];
    }
    g_screen_w = sw;
    g_screen_h = sh;
}

uint32_t exec(ExecMode mode, uint32_t usec) {
    g_mode = mode;
    g_stopped = false;
    g_ticks = 0;
    zx_exec(&g_sys, usec);
    render();
    return g_ticks;
}

inline uint16_t rd16(const uint8_t* p) { return (uint16_t)(p[0] | (p[1] << 8)); }

} // namespace

class ZxCore {
public:
    // Boot the 48K machine with the host-supplied 16K ROM. Safe to call again.
    void init(val rom48k) {
        std::vector<uint8_t> rom = vec_from_val(rom48k);
        zx_desc_t desc = {};
        desc.type = ZX_TYPE_48K;
        desc.audio.callback = { audio_cb, nullptr };
        desc.audio.sample_rate = 44100;
        desc.debug.callback = { debug_cb, nullptr };
        desc.debug.stopped = &g_stopped;
        desc.roms.zx48k = { rom.data(), rom.size() };
        zx_init(&g_sys, &desc);
        g_inited = true;
        g_audio_len = 0;
        render();
    }

    void reset() { zx_reset(&g_sys); }

    // Load a 48K .sna snapshot: 27-byte header + 49152 bytes of RAM
    // (0x4000-0xFFFF). The header carries the full Z80 register file; PC is not
    // stored — it sits on the stack (the snapshot was taken at a RETN), so we
    // pop it and resume there via z80_prefetch.
    bool loadSNA(val bytes) {
        std::vector<uint8_t> d = vec_from_val(bytes);
        if (d.size() < 27 + 0xC000) return false;
        const uint8_t* h = d.data();

        // RAM 0x4000-0xFFFF.
        const uint8_t* ram = h + 27;
        for (int i = 0; i < 0xC000; i++) {
            mem_wr(&g_sys.mem, (uint16_t)(0x4000 + i), ram[i]);
        }

        z80_t* cpu = &g_sys.cpu;
        z80_reset(cpu);   // clear the decoder step state before installing regs
                          // (mirrors zx_quickload — without it z80_prefetch stalls)
        cpu->ir  = (uint16_t)((h[0] << 8) | h[20]); // I (hi) + R (lo)
        cpu->hl2 = rd16(h + 1);
        cpu->de2 = rd16(h + 3);
        cpu->bc2 = rd16(h + 5);
        cpu->af2 = rd16(h + 7);
        cpu->hl  = rd16(h + 9);
        cpu->de  = rd16(h + 11);
        cpu->bc  = rd16(h + 13);
        cpu->iy  = rd16(h + 15);
        cpu->ix  = rd16(h + 17);
        const bool iff2 = (h[19] & 0x04) != 0;
        cpu->iff1 = iff2;
        cpu->iff2 = iff2;
        cpu->af  = rd16(h + 21);
        uint16_t sp = rd16(h + 23);
        cpu->im  = (uint8_t)(h[25] & 0x03);

        // Pop PC off the stack (.sna convention), then resume there.
        const uint16_t pc = (uint16_t)(mem_rd(&g_sys.mem, sp) |
                                       (mem_rd(&g_sys.mem, (uint16_t)(sp + 1)) << 8));
        sp += 2;
        cpu->sp = sp;
        g_sys.pins = z80_prefetch(cpu, pc);
        g_last_pc = pc;
        // (Border byte 26 is left to the program — most set it via OUT (0xFE).)
        render();
        return true;
    }

    uint32_t advanceFrame() { return exec(g_bp_count > 0 ? MODE_FRAME_BP : MODE_RUN, FRAME_USEC); }
    uint32_t step() { return exec(MODE_STEP, STEP_USEC); }

    void setBreakpoints(val addrs) {
        memset(g_bp, 0, sizeof(g_bp));
        g_bp_count = 0;
        const size_t n = addrs["length"].as<size_t>();
        for (size_t i = 0; i < n; i++) {
            const int a = addrs[i].as<int>() & 0xffff;
            if (!g_bp[a]) { g_bp[a] = 1; g_bp_count++; }
        }
    }

    int getPC() const { return g_last_pc; }
    // 16-bit register pairs (anonymous-union members — C++-safe; the 8-bit
    // halves inside the anonymous structs are NOT, so the host splits pairs).
    int getAF() const { return g_sys.cpu.af; }
    int getBC() const { return g_sys.cpu.bc; }
    int getDE() const { return g_sys.cpu.de; }
    int getHL() const { return g_sys.cpu.hl; }
    int getIX() const { return g_sys.cpu.ix; }
    int getIY() const { return g_sys.cpu.iy; }
    int getSP() const { return g_sys.cpu.sp; }
    int getIR() const { return g_sys.cpu.ir; }
    int getAF2() const { return g_sys.cpu.af2; }
    int getBC2() const { return g_sys.cpu.bc2; }
    int getDE2() const { return g_sys.cpu.de2; }
    int getHL2() const { return g_sys.cpu.hl2; }
    int getIM() const { return g_sys.cpu.im; }
    bool getIFF1() const { return g_sys.cpu.iff1; }
    bool getIFF2() const { return g_sys.cpu.iff2; }
    bool isAtInstrBoundary() const { return g_at_boundary; }

    val readMem(int addr, int len) {
        if (len < 0) len = 0;
        if (len > (int)sizeof(g_membuf)) len = sizeof(g_membuf);
        for (int i = 0; i < len; i++) {
            g_membuf[i] = mem_rd(&g_sys.mem, (uint16_t)((addr + i) & 0xffff));
        }
        return val(emscripten::typed_memory_view((size_t)len, g_membuf));
    }

    void keyDown(int key) { zx_key_down(&g_sys, key); }
    void keyUp(int key) { zx_key_up(&g_sys, key); }

    val pixels() {
        return val(emscripten::typed_memory_view((size_t)(g_screen_w * g_screen_h), g_out));
    }

    val getAudioSamples() {
        const size_t n = g_audio_len;
        memcpy(g_audio_out, g_audio, n * sizeof(float));
        g_audio_len = 0;
        return val(emscripten::typed_memory_view(n, g_audio_out));
    }

    int width() const { return g_screen_w; }
    int height() const { return g_screen_h; }
    int sampleRate() const { return 44100; }

    val saveState() {
        zx_save_snapshot(&g_sys, &g_snapshot);
        return val(emscripten::typed_memory_view(sizeof(zx_t), reinterpret_cast<uint8_t*>(&g_snapshot)));
    }

    void loadState(val bytes) {
        std::vector<uint8_t> data = vec_from_val(bytes);
        if (data.size() != sizeof(zx_t)) return;
        memcpy(&g_snapshot, data.data(), sizeof(zx_t));
        zx_load_snapshot(&g_sys, ZX_SNAPSHOT_VERSION, &g_snapshot);
        render();
    }
};

EMSCRIPTEN_BINDINGS(zx_core) {
    using namespace emscripten;
    class_<ZxCore>("ZxCore")
        .constructor<>()
        .function("init", &ZxCore::init)
        .function("reset", &ZxCore::reset)
        .function("loadSNA", &ZxCore::loadSNA)
        .function("advanceFrame", &ZxCore::advanceFrame)
        .function("step", &ZxCore::step)
        .function("setBreakpoints", &ZxCore::setBreakpoints)
        .function("getPC", &ZxCore::getPC)
        .function("getAF", &ZxCore::getAF)
        .function("getBC", &ZxCore::getBC)
        .function("getDE", &ZxCore::getDE)
        .function("getHL", &ZxCore::getHL)
        .function("getIX", &ZxCore::getIX)
        .function("getIY", &ZxCore::getIY)
        .function("getSP", &ZxCore::getSP)
        .function("getIR", &ZxCore::getIR)
        .function("getAF2", &ZxCore::getAF2)
        .function("getBC2", &ZxCore::getBC2)
        .function("getDE2", &ZxCore::getDE2)
        .function("getHL2", &ZxCore::getHL2)
        .function("getIM", &ZxCore::getIM)
        .function("getIFF1", &ZxCore::getIFF1)
        .function("getIFF2", &ZxCore::getIFF2)
        .function("isAtInstrBoundary", &ZxCore::isAtInstrBoundary)
        .function("readMem", &ZxCore::readMem)
        .function("keyDown", &ZxCore::keyDown)
        .function("keyUp", &ZxCore::keyUp)
        .function("pixels", &ZxCore::pixels)
        .function("getAudioSamples", &ZxCore::getAudioSamples)
        .function("saveState", &ZxCore::saveState)
        .function("loadState", &ZxCore::loadState)
        .property("width", &ZxCore::width)
        .property("height", &ZxCore::height)
        .property("sampleRate", &ZxCore::sampleRate);
}
