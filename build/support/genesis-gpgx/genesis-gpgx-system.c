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

/* Emulate one full video frame (CPU/Z80/VDP/sound interleaved). */
EXPORT("run_frame") void sys_run_frame(void) { system_frame_gen(0); }

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

/* Pull one frame of resampled stereo audio. Returns the number of stereo
 * sample frames written into audio_ptr(). */
EXPORT("audio_ptr") int16_t *sys_audio_ptr(void) { return audio_buffer_; }
EXPORT("audio_update") int sys_audio_update(void) { return audio_update(audio_buffer_); }

/* Set the digital button bitmask for a controller port (0 or 1). */
EXPORT("set_input") void sys_set_input(int port, int buttons)
{
  if (port >= 0 && port < MAX_INPUTS) input.pad[port] = (uint16)buttons;
}
