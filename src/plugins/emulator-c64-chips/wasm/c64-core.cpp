// C64 wasm core — a thin Embind wrapper over floooh/chips `systems/c64.h`.
//
// Mirrors the AltirraCore shape (see src/adapters/emu/altirra.ts) so the
// RunBackend host stays a near-copy: a C64Core class exposing frame advance,
// instruction step, breakpoint-granular trapping, CPU/memory inspection,
// keyboard input, and a SID audio tap. The chips core is dependency-free C99;
// we compile it here with CHIPS_IMPL in one translation unit.
//
// ROMs are NOT bundled into this core — init() takes the KERNAL / BASIC /
// CHARGEN images from the host (the GPL-3 MEGA65 Open ROMs; the Cloanto-
// copyright Commodore ROMs are never shipped). chips copies them into its own
// state at init, so the host's buffers are free afterward.

#include <cstdint>
#include <cstring>
#include <vector>
#include <emscripten/bind.h>
#include <emscripten/val.h>

// chips is C99; its implementation compiles only as C (see c64-impl.c). Here we
// pull in just the declarations — no CHIPS_IMPL — under `extern "C"` so the
// names match the symbols defined by the C translation unit at link time.
extern "C" {
#include "chips/chips_common.h"
#include "chips/m6502.h"
#include "chips/m6526.h"
#include "chips/m6569.h"
#include "chips/m6581.h"
#include "chips/m6522.h"
#include "chips/kbd.h"
#include "chips/mem.h"
#include "chips/clk.h"
#include "systems/c1530.h"
#include "systems/c1541.h"
#include "systems/c64.h"
}

using emscripten::val;

namespace {

// One PAL frame in microseconds (50 Hz). c64_exec ticks the whole machine for
// this slice; the VIC renders exactly one field into the framebuffer.
constexpr uint32_t FRAME_USEC = 20000;
// Cold-boot warmup before a .prg load. quickload writes RAM the KERNAL boot
// would clobber, and c64_basic_run types RUN — both need BASIC at the READY
// prompt. Open ROMs reach READY in ~30 frames; 90 is a safe margin (a few ms
// of wasm, one-time per load).
constexpr int BOOT_FRAMES = 90;
// Generous slice for a single-instruction step — c64_exec bails at the first
// instruction boundary long before this budget is reached.
constexpr uint32_t STEP_USEC = 100000;

// Visible C64 PAL screen (the `_C64_SCREEN_*` macros are private to the chips
// IMPL section, so we restate the public dimensions here). c64_display_info()'s
// screen rect is the live source of truth for cropping; these only size the
// output buffer and clamp.
constexpr int SCREEN_W = 392;
constexpr int SCREEN_H = 272;

c64_t g_sys;
c64_t g_snapshot;   // scratch backing saveState()/loadState()
bool g_inited = false;

// RGBA8888 output cropped to the visible screen (392×272). The chips palette
// is already 0xFFBBGGRR (canvas-native little-endian RGBA), so the host blits
// it with a straight memcpy — no channel swap.
uint32_t g_out[SCREEN_W * SCREEN_H];
int g_screen_w = SCREEN_W;
int g_screen_h = SCREEN_H;

// Scratch buffer backing readMem()'s typed view.
uint8_t g_membuf[0x10000];

// SID audio tap. The callback appends samples during exec; getAudioSamples()
// drains them into a stable scratch the host copies out (same model as the
// Altirra POKEY / jsnes APU pumps).
constexpr size_t AUDIO_CAP = 1 << 14;
float g_audio[AUDIO_CAP];
size_t g_audio_len = 0;
float g_audio_out[AUDIO_CAP];

// Breakpoint set, indexed by CPU address.
uint8_t g_bp[0x10000];
int g_bp_count = 0;

// Debug-loop state, driven by the per-tick callback below.
enum ExecMode { MODE_RUN, MODE_STEP, MODE_FRAME_BP };
ExecMode g_mode = MODE_RUN;
bool g_stopped = false;
uint16_t g_last_pc = 0;   // PC latched at the most recent opcode fetch (SYNC)
bool g_at_boundary = false;
uint32_t g_ticks = 0;     // ticks executed in the current exec call

void audio_cb(const float* samples, int num, void* /*user*/) {
    for (int i = 0; i < num; i++) {
        if (g_audio_len < AUDIO_CAP) g_audio[g_audio_len++] = samples[i];
    }
}

// Fires after every CPU tick. On an opcode fetch (M6502_SYNC) the address bus
// holds the PC of the instruction being fetched — latch it for getPC() and
// apply the active stop policy:
//   STEP     — stop at the first fetch (run exactly one instruction);
//   FRAME_BP — stop at a fetch whose PC is breakpointed (break before the
//              instruction's data cycles run).
// Because a SYNC tick has already executed by the time we stop, resuming
// naturally completes that instruction and the next fetch is a different PC —
// so a breakpoint never re-traps itself in place (no step-over bookkeeping).
void debug_cb(void* /*user*/, uint64_t pins) {
    g_ticks++;
    if (pins & M6502_SYNC) {
        g_last_pc = (uint16_t)M6502_GET_ADDR(pins);
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
    // Copy a JS Uint8Array into a std::vector. vecFromJSArray iterates the JS
    // array by index — no dependency on Module.HEAPU8 being exported.
    return emscripten::vecFromJSArray<uint8_t>(v);
}

void render() {
    chips_display_info_t info = c64_display_info(&g_sys);
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
    c64_exec(&g_sys, usec);
    render();
    return g_ticks;
}

} // namespace

class C64Core {
public:
    // Boot the machine with host-supplied ROM images (kernal 8K, basic 8K,
    // chargen 4K). Safe to call again to re-init with different ROMs.
    void init(val kernal, val basic, val chargen) {
        std::vector<uint8_t> k = vec_from_val(kernal);
        std::vector<uint8_t> b = vec_from_val(basic);
        std::vector<uint8_t> c = vec_from_val(chargen);
        c64_desc_t desc = {};
        desc.audio.callback = { audio_cb, nullptr };
        desc.audio.sample_rate = 44100;
        desc.debug.callback = { debug_cb, nullptr };
        desc.debug.stopped = &g_stopped;
        desc.roms.chars = { c.data(), c.size() };
        desc.roms.basic = { b.data(), b.size() };
        desc.roms.kernal = { k.data(), k.size() };
        c64_init(&g_sys, &desc);
        g_inited = true;
        g_audio_len = 0;
        render();
    }

    void reset() {
        c64_reset(&g_sys);
    }

    // Load a .prg (first two bytes = little-endian load address) and start it
    // via a BASIC RUN — the $0801 SYS stub that cc65/MADS emit is what RUN
    // dispatches to. Reset + warmup first so BASIC is at the READY prompt no
    // matter when the host calls this (the run loop loads as soon as the
    // backend boots, long before the KERNAL cold-boot would finish).
    bool loadPRG(val bytes) {
        std::vector<uint8_t> data = vec_from_val(bytes);
        c64_reset(&g_sys);
        g_mode = MODE_RUN;
        g_stopped = false;
        for (int i = 0; i < BOOT_FRAMES; i++) c64_exec(&g_sys, FRAME_USEC);
        if (!c64_quickload(&g_sys, { data.data(), data.size() })) return false;
        c64_basic_run(&g_sys);
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
    int getA() const { return g_sys.cpu.A; }
    int getX() const { return g_sys.cpu.X; }
    int getY() const { return g_sys.cpu.Y; }
    int getS() const { return g_sys.cpu.S; }
    int getP() const { return g_sys.cpu.P; }
    bool isAtInstrBoundary() const { return g_at_boundary; }

    val readMem(int addr, int len) {
        if (len < 0) len = 0;
        if (len > (int)sizeof(g_membuf)) len = sizeof(g_membuf);
        for (int i = 0; i < len; i++) {
            g_membuf[i] = mem_rd(&g_sys.mem_cpu, (uint16_t)((addr + i) & 0xffff));
        }
        return val(emscripten::typed_memory_view((size_t)len, g_membuf));
    }

    void keyDown(int key) { c64_key_down(&g_sys, key); }
    void keyUp(int key) { c64_key_up(&g_sys, key); }

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

    // Full-machine snapshot. c64_save_snapshot copies the live state into a
    // scratch instance, patching internal pointers to offsets so the raw bytes
    // are position-independent; loadState reverses it. The host treats the
    // bytes as opaque (history/undo). Version-tagged: a mismatched blob is
    // ignored rather than corrupting state.
    val saveState() {
        c64_save_snapshot(&g_sys, &g_snapshot);
        return val(emscripten::typed_memory_view(sizeof(c64_t), reinterpret_cast<uint8_t*>(&g_snapshot)));
    }

    void loadState(val bytes) {
        std::vector<uint8_t> data = vec_from_val(bytes);
        if (data.size() != sizeof(c64_t)) return;
        memcpy(&g_snapshot, data.data(), sizeof(c64_t));
        c64_load_snapshot(&g_sys, C64_SNAPSHOT_VERSION, &g_snapshot);
        render();
    }
};

EMSCRIPTEN_BINDINGS(c64_core) {
    using namespace emscripten;
    class_<C64Core>("C64Core")
        .constructor<>()
        .function("init", &C64Core::init)
        .function("reset", &C64Core::reset)
        .function("loadPRG", &C64Core::loadPRG)
        .function("advanceFrame", &C64Core::advanceFrame)
        .function("step", &C64Core::step)
        .function("setBreakpoints", &C64Core::setBreakpoints)
        .function("getPC", &C64Core::getPC)
        .function("getA", &C64Core::getA)
        .function("getX", &C64Core::getX)
        .function("getY", &C64Core::getY)
        .function("getS", &C64Core::getS)
        .function("getP", &C64Core::getP)
        .function("isAtInstrBoundary", &C64Core::isAtInstrBoundary)
        .function("readMem", &C64Core::readMem)
        .function("keyDown", &C64Core::keyDown)
        .function("keyUp", &C64Core::keyUp)
        .function("pixels", &C64Core::pixels)
        .function("getAudioSamples", &C64Core::getAudioSamples)
        .function("saveState", &C64Core::saveState)
        .function("loadState", &C64Core::loadState)
        .property("width", &C64Core::width)
        .property("height", &C64Core::height)
        .property("sampleRate", &C64Core::sampleRate);
}
