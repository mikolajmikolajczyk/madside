/*
 * Minimal Sega Mega Drive / Genesis 68000 system around the Musashi core, built
 * as a wasm32 *reactor* (exported functions, no _start) for the in-browser
 * emulator backend (#145, Phase A). Headless: CPU + a flat memory bus (cartridge
 * ROM + 64K work RAM). No VDP/sound yet — that's Phase B.
 *
 * Memory map (68000, 24-bit bus):
 *   $000000-$3FFFFF  cartridge ROM (read-only)
 *   $E00000-$FFFFFF  64K work RAM, mirrored every 64K (real RAM at $FF0000)
 *   everything else  unmapped (reads 0xFF, writes ignored) — IO/VDP are Phase B
 *
 * Musashi calls the m68k_read/write_memory_* below; JS drives the exported API
 * (init / load_rom / reset / run_cycles / get_reg / read_byte) and reads the ROM
 * window through the exported rom_ptr buffer.
 */
#include "m68k.h"
#include <stdint.h>

#define ROM_SIZE 0x400000u   /* 4 MB cartridge window */
#define RAM_SIZE 0x10000u    /* 64 KB work RAM */

static uint8_t rom[ROM_SIZE];
static uint32_t rom_len = 0;
static uint8_t ram[RAM_SIZE];

#define EXPORT(name) __attribute__((export_name(name)))

static inline int addr_is_ram(uint32_t a) { return a >= 0xE00000u; }
static inline uint32_t ram_off(uint32_t a) { return a & (RAM_SIZE - 1u); }

/* ---- Musashi memory bus ------------------------------------------------- */
unsigned int m68k_read_memory_8(unsigned int a) {
  a &= 0xFFFFFFu;
  if (a < rom_len) return rom[a];
  if (addr_is_ram(a)) return ram[ram_off(a)];
  return 0xFF;
}
unsigned int m68k_read_memory_16(unsigned int a) {
  return (m68k_read_memory_8(a) << 8) | m68k_read_memory_8(a + 1);
}
unsigned int m68k_read_memory_32(unsigned int a) {
  return (m68k_read_memory_16(a) << 16) | m68k_read_memory_16(a + 2);
}
void m68k_write_memory_8(unsigned int a, unsigned int v) {
  a &= 0xFFFFFFu;
  if (addr_is_ram(a)) ram[ram_off(a)] = (uint8_t)v;
  /* ROM + unmapped/IO writes are dropped (Phase B wires VDP/IO). */
}
void m68k_write_memory_16(unsigned int a, unsigned int v) {
  m68k_write_memory_8(a, v >> 8);
  m68k_write_memory_8(a + 1, v);
}
void m68k_write_memory_32(unsigned int a, unsigned int v) {
  m68k_write_memory_16(a, v >> 16);
  m68k_write_memory_16(a + 2, v);
}
/* Disassembler reads (if the dasm unit is linked) share the bus. */
unsigned int m68k_read_disassembler_8(unsigned int a) { return m68k_read_memory_8(a); }
unsigned int m68k_read_disassembler_16(unsigned int a) { return m68k_read_memory_16(a); }
unsigned int m68k_read_disassembler_32(unsigned int a) { return m68k_read_memory_32(a); }

/* ---- exported API ------------------------------------------------------- */
EXPORT("rom_ptr") uint8_t *sys_rom_ptr(void) { return rom; }
EXPORT("rom_capacity") uint32_t sys_rom_capacity(void) { return ROM_SIZE; }
EXPORT("ram_ptr") uint8_t *sys_ram_ptr(void) { return ram; }
EXPORT("ram_size") uint32_t sys_ram_size(void) { return RAM_SIZE; }

EXPORT("init") void sys_init(void) {
  m68k_init();
  m68k_set_cpu_type(M68K_CPU_TYPE_68000);
}

/* JS writes the ROM image into rom_ptr()[0..len), then calls this — it records
 * the length and pulses reset so the 68000 fetches SSP/PC from the vector table. */
EXPORT("load_rom") void sys_load_rom(uint32_t len) {
  rom_len = len > ROM_SIZE ? ROM_SIZE : len;
  m68k_pulse_reset();
}

EXPORT("reset") void sys_reset(void) { m68k_pulse_reset(); }

/* Run up to `n` cycles; returns the cycles actually consumed. */
EXPORT("run_cycles") int sys_run_cycles(int n) { return m68k_execute(n); }

/* Read a CPU register by its m68k_register_t index (D0=0..D7, A0=8..A7, PC=16,
 * SR=17, SP=18, …). */
EXPORT("get_reg") unsigned int sys_get_reg(int r) {
  return m68k_get_reg(0, (m68k_register_t)r);
}

/* Read one byte off the CPU bus (decoded like the core sees it). */
EXPORT("read_byte") unsigned int sys_read_byte(uint32_t a) { return m68k_read_memory_8(a); }
