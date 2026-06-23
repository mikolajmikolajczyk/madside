/*
 * Minimal osd.h for the madside Genesis Plus GX wasm build (#145, Phase B).
 *
 * Replaces libretro/osd.h: same contract the core expects (t_config, the global
 * config + BIOS path strings, load_archive/osd_input_update prototypes, sprite
 * limit + cdStream macros) but with NO libretro-common dependency — the file
 * stream layer is reduced to plain stdio so cd_hw/*.c still compiles, and the
 * cheat hook (CHEATS_UPDATE) is left undefined so the few `#ifdef CHEATS_UPDATE`
 * sites compile out. The frontend globals live in genesis-gpgx-system.c.
 *
 * The t_config struct layout MUST match what the core reads — it is copied
 * verbatim from libretro/osd.h (no USE_PER_SOUND_CHANNELS_CONFIG, no
 * HAVE_YM3438_CORE / HAVE_OPLL_CORE unless those defines are set at build time).
 */
#ifndef _OSD_H
#define _OSD_H

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

#define MAX_INPUTS 8
#define MAX_KEYS 8
#define MAXPATHLEN 1024

#ifndef TRUE
#define TRUE 1
#endif

#ifndef FALSE
#define FALSE 0
#endif

#ifndef M_PI
#define M_PI 3.1415926535897932385
#endif

#include "scrc32.h"

/* No CHEATS_UPDATE: the `#ifdef CHEATS_UPDATE` sites in cart_hw compile out. */

#define HAVE_NO_SPRITE_LIMIT
#define MAX_SPRITES_PER_LINE 80
#define TMS_MAX_SPRITES_PER_LINE (config.no_sprite_limit ? MAX_SPRITES_PER_LINE : 4)
#define MODE4_MAX_SPRITES_PER_LINE (config.no_sprite_limit ? MAX_SPRITES_PER_LINE : 8)
#define MODE5_MAX_SPRITES_PER_LINE (config.no_sprite_limit ? MAX_SPRITES_PER_LINE : (bitmap.viewport.w >> 4))
#define MODE5_MAX_SPRITE_PIXELS (config.no_sprite_limit ? MAX_SPRITES_PER_LINE * 32 : max_sprite_pixels)

typedef struct
{
  int8 device;
  uint8 port;
  uint8 padtype;
} t_input_config;

typedef struct
{
  char version[16];
  uint8 hq_fm;
  uint8 filter;
  uint8 hq_psg;
  uint8 ym2612;
  uint8 ym2413;
#ifdef HAVE_YM3438_CORE
  uint8 ym3438;
#endif
#ifdef HAVE_OPLL_CORE
  uint8 opll;
#endif
  uint8 mono;
  int16 psg_preamp;
  int16 fm_preamp;
  int16 cdda_volume;
  int16 pcm_volume;
  uint16 lp_range;
  int16 low_freq;
  int16 high_freq;
  int16 lg;
  int16 mg;
  int16 hg;
  uint8 system;
  uint8 region_detect;
  uint8 master_clock;
  uint8 vdp_mode;
  uint8 force_dtack;
  uint8 addr_error;
  uint8 bios;
  uint8 lock_on;
  uint8 add_on;
  uint8 overscan;
  uint8 aspect_ratio;
  uint8 ntsc;
  uint8 lcd;
  uint8 gg_extra;
  uint8 left_border;
  uint8 render;
  t_input_config input[MAX_INPUTS];
  uint8 invert_mouse;
  uint8 gun_cursor;
  uint32 overclock;
  uint8 no_sprite_limit;
  uint8 enhanced_vscroll;
  uint8 enhanced_vscroll_limit;
  uint8 cd_latency;
#ifdef USE_PER_SOUND_CHANNELS_CONFIG
  unsigned int psg_ch_volumes[4];
  int32 md_ch_volumes[6];
  signed int sms_fm_ch_volumes[9];
#endif
} t_config;

extern t_config config;

extern char GG_ROM[256];
extern char AR_ROM[256];
extern char SK_ROM[256];
extern char SK_UPMEM[256];
extern char GG_BIOS[256];
extern char MD_BIOS[256];
extern char CD_BIOS_EU[256];
extern char CD_BIOS_US[256];
extern char CD_BIOS_JP[256];
extern char MS_BIOS_US[256];
extern char MS_BIOS_EU[256];
extern char MS_BIOS_JP[256];

extern void osd_input_update(void);
extern int load_archive(char *filename, unsigned char *buffer, int maxsize, char *extension);

/* cd_hw streams its CD image through these; reduced to plain stdio. With no real
 * filesystem under wasi these calls fail gracefully at runtime — madside never
 * loads a CD image (cartridge ROM only), so cd_hw compiles but is never driven. */
#ifndef cdStream
#define cdStream            FILE
#define cdStreamOpen(fname) fopen(fname, "rb")
#define cdStreamClose       fclose
#define cdStreamRead        fread
#define cdStreamSeek        fseek
#define cdStreamTell        ftell
#define cdStreamGets        fgets
#endif

#endif /* _OSD_H */
