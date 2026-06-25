/*
 * madside frontend harness for Genesis Plus GX, built as a wasm32 *reactor*
 * (exported functions, no _start) — the full Sega Mega Drive system (VDP +
 * YM2612/PSG + Z80 + I/O), Phase B of #145. Replaces libretro/libretro.c: it
 * supplies the frontend globals the core expects (config, the BIOS path strings,
 * load_archive, osd_input_update, the framebuffer) and exposes a small C API the
 * JS RunBackend drives.
 *
 * ROM load is buffer-based (no filesystem): JS writes the cartridge image into
 * rom_ptr()[0..len), calls load_rom_buffer(len); load_archive() then memcpy's it
 * into the core's cart.rom — mirroring libretro's g_rom_data fast path.
 *
 * Framebuffer is 32bpp (USE_32BPP_RENDERING): each pixel is 0xAARRGGBB with
 * alpha forced to 0xFF (see MAKE_PIXEL in vdp_render.c). fb_width/height/pitch
 * report the active viewport so JS can blit the live region out of the 720x576
 * max bitmap.
 */
#include "shared.h"
#include <stdint.h>

#define EXPORT(name) __attribute__((export_name(name)))

/* ---- frontend globals the core links against (libretro.c equivalents) --- */
t_config config;

char GG_ROM[256];
char AR_ROM[256];
char SK_ROM[256];
char SK_UPMEM[256];
char GG_BIOS[256];
char MD_BIOS[256];
char CD_BIOS_EU[256];
char CD_BIOS_US[256];
char CD_BIOS_JP[256];
char MS_BIOS_US[256];
char MS_BIOS_EU[256];
char MS_BIOS_JP[256];

/* 720x576 is the maximum MD/SMS bitmap; 32bpp output -> uint32 per pixel. */
static uint32_t bitmap_data_[720 * 576];

/* Staging buffer JS fills with the cartridge image, drained by load_archive. */
static uint8_t g_rom_data[MAXROMSIZE];
static int g_rom_size = 0;

/* Stereo S16 sample scratch for audio_update (1 NTSC frame is ~735 stereo
 * samples at 44.1kHz; keep generous headroom). */
static int16_t audio_buffer_[4096 * 2];

/* ---- osd hooks the core calls --------------------------------------------- */

/* Drains the staging buffer into the core ROM area on the frontend ROM load
 * (maxsize >= 0x800000), mirroring libretro's g_rom_data path. BOOT/Lock-On ROM
 * loads (smaller maxsize) return 0 — those optional files are absent. */
int load_archive(char *filename, unsigned char *buffer, int maxsize, char *extension)
{
  if (extension)
  {
    size_t n = strlen(filename);
    memcpy(extension, &filename[n - 3], 3);
    extension[3] = 0;
  }

  if (maxsize >= 0x800000 && g_rom_size > 0)
  {
    int size = g_rom_size;
    if (size > maxsize) size = maxsize;
    memcpy(buffer, g_rom_data, size);
    return size;
  }

  return 0;
}

/* Inputs are pushed from JS via set_input(); nothing to poll here. */
void osd_input_update(void) {}

/* ---- config + bitmap defaults (libretro init_config / init_bitmap) -------- */

static void init_config(void)
{
  int i;
  memset(&config, 0, sizeof(config));

  config.psg_preamp     = 150;
  config.fm_preamp      = 100;
  config.cdda_volume    = 100;
  config.pcm_volume     = 100;
  config.hq_fm          = 1;
  config.hq_psg         = 1;
  config.filter         = 0;          /* no low-pass filter */
  config.lp_range       = 0x9999;
  config.low_freq       = 880;
  config.high_freq      = 5000;
  config.lg             = 100;
  config.mg             = 100;
  config.hg             = 100;
  config.mono           = 0;          /* stereo */
  config.system         = 0;          /* AUTO */
  config.region_detect  = 0;          /* AUTO */
  config.vdp_mode       = 0;          /* AUTO */
  config.master_clock   = 0;          /* AUTO */
  config.force_dtack    = 0;
  config.addr_error     = 0;          /* disable 68k address-error trap (no SjLj on wasm) */
  config.bios           = 0;
  config.lock_on        = 0;
  config.add_on         = 0;          /* HW_ADDON_NONE */
  config.overclock      = 100;
  config.no_sprite_limit = 0;
  config.enhanced_vscroll = 0;
  config.enhanced_vscroll_limit = 8;
  config.overscan       = 0;
  config.aspect_ratio   = 0;
  config.gg_extra       = 0;
  config.ntsc           = 0;
  config.lcd            = 0;
  config.render         = 0;          /* progressive */
  config.left_border    = 0;

  /* Two standard 3-button-capable gamepads (auto-selects pad type per game). */
  input.system[0] = SYSTEM_GAMEPAD;
  input.system[1] = SYSTEM_GAMEPAD;
  for (i = 0; i < MAX_INPUTS; i++)
  {
    config.input[i].padtype = DEVICE_PAD2B | DEVICE_PAD3B | DEVICE_PAD6B;
  }
}

static void init_bitmap(void)
{
  memset(&bitmap, 0, sizeof(bitmap));
  bitmap.width  = 720;
  bitmap.height = 576;
  bitmap.pitch  = 720 * sizeof(uint32_t);
  bitmap.data   = (uint8_t *)bitmap_data_;
}

/* ---- exported API --------------------------------------------------------- */

/* Frontend setup only — the system can't be init'd until a ROM has been parsed
 * (system_init/reset configure VDP/memory map from the detected system_hw). */
EXPORT("init") void sys_init(void)
{
  init_config();
  init_bitmap();
}

EXPORT("rom_ptr") uint8_t *sys_rom_ptr(void) { return g_rom_data; }
EXPORT("rom_capacity") uint32_t sys_rom_capacity(void) { return MAXROMSIZE; }

/* JS writes the cartridge image into rom_ptr()[0..len), then calls this. Mirrors
 * libretro retro_load_game order: load_rom -> audio_init -> system_init ->
 * system_reset (the memory map / VDP mode are installed off the detected hw). */
EXPORT("load_rom_buffer") int sys_load_rom_buffer(int len)
{
  if (len < 0) len = 0;
  if (len > MAXROMSIZE) len = MAXROMSIZE;
  g_rom_size = len;
  /* "game.bin" -> extension "BIN" -> Mega Drive hardware (SYSTEM_MD). */
  int ok = load_rom("game.bin");
  if (!ok) return 0;

  system_hw = romtype;        /* config.system == AUTO -> detected hardware */
  audio_init(44100, 60.0);    /* 44.1kHz, 60fps NTSC; must precede system_init */
  system_init();
  system_reset();
  m68k.aerr_enabled = 0;      /* keep the address-error longjmp path dormant */
  return ok;
}

EXPORT("reset") void sys_reset(void)
{
  system_reset();
  m68k.aerr_enabled = 0;
}

/* ---- 68000 breakpoints (instruction-granular trap, #146) -----------------
 * gpgx is frame-scheduled, so a frame-boundary PC check almost never lands on a
 * breakpoint. Instead, a one-line patch in the core's m68k_run loop
 * (build-genesis-gpgx.sh) calls md_bp_check(REG_PC) before each instruction is
 * fetched + executed; on a breakpoint match it `break`s the loop, so the CPU
 * stops with PC exactly at the breakpoint (NOT executed). The remaining in-frame
 * m68k_run calls re-break immediately at the same PC, freezing the 68000 for the
 * rest of the frame while VDP/Z80/audio finish it. (gpgx ships a fuller HOOK_CPU
 * hook, but enabling it inlines hook calls into every memory access and bloats
 * codegen past a wasi-sdk clang crash — this single execute check is enough.) */
#define MD_BP_CAP 64
static uint32_t g_m68k_bps[MD_BP_CAP];
static int g_m68k_bp_count = 0;
/* Set by md_bp_check on a hit; read by sys_run_frame to report the trap. */
static int g_m68k_trapped = 0;
/* When resuming from a parked breakpoint, the instruction AT the trapped PC must
 * run once without re-trapping, else the program can't make progress. One-shot. */
static uint32_t g_skip_pc = 0xFFFFFFFFu;
/* The PC we last trapped at. run_frame only skips the parked instruction when the
 * current PC equals this — i.e. we're genuinely resuming from that breakpoint.
 * Otherwise a breakpoint on the entry point (the reset PC) would be skipped on
 * the very first run instead of trapping. */
static uint32_t g_last_trap_pc = 0xFFFFFFFFu;
/* Single-instruction step (set by sys_step): md_bp_check returns 0 so the step
 * runs exactly one instruction regardless of breakpoints — the cycle budget,
 * not a breakpoint, stops it. */
static int g_step_mode = 0;

static int md_bp_hit(uint32_t pc)
{
  for (int i = 0; i < g_m68k_bp_count; i++)
    if (g_m68k_bps[i] == pc) return 1;
  return 0;
}

/* Called from the patched m68k_run loop before each instruction. Returns 1 to
 * stop the loop with PC left at `pc` (a breakpoint), 0 to keep running. */
int md_bp_check(unsigned int pc)
{
  if (g_step_mode) return 0; /* a single-instruction step ignores breakpoints */
  if (g_m68k_bp_count == 0) return 0;
  if (pc == g_skip_pc) { g_skip_pc = 0xFFFFFFFFu; return 0; } /* resumed instr */
  if (md_bp_hit((uint32_t)pc)) { g_m68k_trapped = 1; g_last_trap_pc = pc; return 1; }
  return 0;
}

/* JS writes up to bp_capacity() breakpoint addresses into bp_ptr()[0..n), then
 * calls set_bp_count(n). A count of 0 disables the check (full-speed run). */
EXPORT("bp_ptr") uint32_t *sys_bp_ptr(void) { return g_m68k_bps; }
EXPORT("bp_capacity") int sys_bp_capacity(void) { return MD_BP_CAP; }
EXPORT("set_bp_count") void sys_set_bp_count(int n)
{
  if (n < 0) n = 0;
  if (n > MD_BP_CAP) n = MD_BP_CAP;
  g_m68k_bp_count = n;
}

/* ---- Z80 breakpoints (same design as the 68000, on the patched z80_run loop).
 * The Z80 is a 16-bit-PC sound coprocessor; breakpoints are its own addresses. */
static uint32_t g_z80_bps[MD_BP_CAP];
static int g_z80_bp_count = 0;
static int g_z80_trapped = 0;
static uint32_t g_z80_skip_pc = 0xFFFFFFFFu;
static uint32_t g_z80_last_trap_pc = 0xFFFFFFFFu;
static int g_z80_step_mode = 0;

static int md_z80_bp_hit(uint32_t pc)
{
  for (int i = 0; i < g_z80_bp_count; i++)
    if (g_z80_bps[i] == pc) return 1;
  return 0;
}

/* Called from the patched z80_run loop before each instruction. */
int md_z80_bp_check(unsigned int pc)
{
  if (g_z80_step_mode) return 0;
  if (g_z80_bp_count == 0) return 0;
  if (pc == g_z80_skip_pc) { g_z80_skip_pc = 0xFFFFFFFFu; return 0; }
  if (md_z80_bp_hit((uint32_t)pc)) { g_z80_trapped = 1; g_z80_last_trap_pc = pc; return 1; }
  return 0;
}

EXPORT("z80_bp_ptr") uint32_t *sys_z80_bp_ptr(void) { return g_z80_bps; }
EXPORT("z80_bp_capacity") int sys_z80_bp_capacity(void) { return MD_BP_CAP; }
EXPORT("set_z80_bp_count") void sys_set_z80_bp_count(int n)
{
  if (n < 0) n = 0;
  if (n > MD_BP_CAP) n = MD_BP_CAP;
  g_z80_bp_count = n;
}

/* Single-step one Z80 instruction (z80_run always runs >=1, the cycle budget
 * stops it; g_z80_step_mode makes the breakpoint check a no-op). */
EXPORT("z80_step") int sys_z80_step(void)
{
  unsigned int before = Z80.cycles;
  g_z80_step_mode = 1;
  z80_run(Z80.cycles + 1);
  g_z80_step_mode = 0;
  return (int)(Z80.cycles - before);
}

/* Emulate one full video frame (CPU/Z80/VDP/sound interleaved). Returns 1 on a
 * completed frame, 0 if a 68000 OR Z80 breakpoint trapped (that CPU's PC is left
 * at the breakpoint). */
EXPORT("run_frame") int sys_run_frame(void)
{
  g_m68k_trapped = 0;
  g_z80_trapped = 0;
  /* Skip the parked instruction ONLY when resuming from the breakpoint we last
   * trapped at (current PC == last-trap PC). A fresh run whose entry PC merely
   * happens to be a breakpoint still traps immediately. */
  unsigned int pc = m68k_get_reg(M68K_REG_PC);
  g_skip_pc = (g_m68k_bp_count > 0 && pc == g_last_trap_pc) ? pc : 0xFFFFFFFFu;
  unsigned int zpc = Z80.pc.w.l;
  g_z80_skip_pc = (g_z80_bp_count > 0 && zpc == g_z80_last_trap_pc) ? zpc : 0xFFFFFFFFu;
  system_frame_gen(0);
  return (g_m68k_trapped || g_z80_trapped) ? 0 : 1;
}

/* Execute exactly one 68000 instruction (debugger single-step). Runs only the
 * 68000 (Z80/VDP/audio stay put) by giving m68k_run a 1-cycle budget: the loop
 * always runs at least one instruction, then the cycle check stops it. Returns
 * the cycles that instruction took. Breakpoints are ignored for the step. */
EXPORT("step") int sys_step(void)
{
  unsigned int before = m68k.cycles;
  g_step_mode = 1;
  m68k_run(m68k.cycles + 1);
  g_step_mode = 0;
  return (int)(m68k.cycles - before);
}

/* Framebuffer access (32bpp ARGB, alpha=0xFF). */
EXPORT("framebuffer") uint8_t *sys_framebuffer(void) { return bitmap.data; }
EXPORT("fb_width")  int sys_fb_width(void)  { return bitmap.viewport.w; }
EXPORT("fb_height") int sys_fb_height(void) { return bitmap.viewport.h; }
EXPORT("fb_pitch")  int sys_fb_pitch(void)  { return bitmap.pitch; }
/* X/Y offset of the live viewport within the 720x576 bitmap. */
EXPORT("fb_x") int sys_fb_x(void) { return bitmap.viewport.x; }
EXPORT("fb_y") int sys_fb_y(void) { return bitmap.viewport.y; }

/* Read a CPU register by m68k_register_t index (D0=0..D7, A0=8..A7, PC=16,
 * SR=17). gpgx's m68k_get_reg takes a single argument (no context pointer). */
EXPORT("get_reg") unsigned int sys_get_reg(int r)
{
  return m68k_get_reg((m68k_register_t)r);
}

/* Read one byte off the 68000 bus, decoded through the active memory map
 * (handlers for VDP/IO, direct base for ROM/RAM; READ_BYTE applies the
 * little-endian 16-bit byteswap). */
EXPORT("read_byte") unsigned int sys_read_byte(unsigned int a)
{
  cpu_memory_map *m = &m68k.memory_map[(a >> 16) & 0xff];
  if (m->read8) return m->read8(a & 0xffffff);
  return READ_BYTE(m->base, a & 0xffff);
}

/* ---- Z80 sound coprocessor debug surface (dual-CPU debug, #147 Phase 2) ----
 * Read a Z80 register by index. PAIR is LSB_FIRST here, so `.w.l` is the 16-bit
 * register. Order: PC SP AF BC DE HL IX IY AF' BC' DE' HL' I R IM IFF1 IFF2. */
EXPORT("z80_get_reg") unsigned int sys_z80_get_reg(int r)
{
  switch (r) {
    case 0:  return Z80.pc.w.l;
    case 1:  return Z80.sp.w.l;
    case 2:  return Z80.af.w.l;
    case 3:  return Z80.bc.w.l;
    case 4:  return Z80.de.w.l;
    case 5:  return Z80.hl.w.l;
    case 6:  return Z80.ix.w.l;
    case 7:  return Z80.iy.w.l;
    case 8:  return Z80.af2.w.l;
    case 9:  return Z80.bc2.w.l;
    case 10: return Z80.de2.w.l;
    case 11: return Z80.hl2.w.l;
    case 12: return Z80.i;
    case 13: return Z80.r;
    case 14: return Z80.im;
    case 15: return Z80.iff1;
    case 16: return Z80.iff2;
    default: return 0;
  }
}

/* Read one byte of Z80 address space: the 8 KB RAM directly ($0000-$1FFF,
 * mirrored through $3FFF), else via the Z80 read map (YM2612 / bank window). */
EXPORT("z80_read_byte") unsigned int sys_z80_read_byte(unsigned int a)
{
  a &= 0xffff;
  if (a < 0x4000) return zram[a & 0x1fff];
  return z80_readmem ? z80_readmem(a) : 0;
}

/* The Z80 $8000-$FFFF bank window's base in the 68000 address space — the live
 * value of the write-only $6000 bank register (bits 15-23). A Z80 address $8000+
 * reads the 68000 byte at `z80_bank() | (addr & 0x7FFF)` (#147 Phase 3). */
EXPORT("z80_bank") unsigned int sys_z80_bank(void) { return zbank; }

/* Pull one frame of resampled stereo audio. Returns the number of stereo
 * sample frames written into audio_ptr(). */
EXPORT("audio_ptr") int16_t *sys_audio_ptr(void) { return audio_buffer_; }
EXPORT("audio_update") int sys_audio_update(void) { return audio_update(audio_buffer_); }

/* Set the digital button bitmask for a controller port (0 or 1). */
EXPORT("set_input") void sys_set_input(int port, int buttons)
{
  if (port >= 0 && port < MAX_INPUTS) input.pad[port] = (uint16)buttons;
}
