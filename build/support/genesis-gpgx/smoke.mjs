// Smoke test for genesis-gpgx.wasm (#145, Phase B): hand-build a minimal Mega
// Drive ROM (SEGA header + reset vector + code that loads $12345678 into D0),
// load it through the buffer path, emulate a couple of frames, and check the
// register. Validates the full-system reactor end-to-end: init / load_rom_buffer
// / run_frame / get_reg / read_byte + the live framebuffer geometry.
import { readFile } from 'node:fs/promises'

const wasmPath = process.argv[2]
const bytes = await readFile(wasmPath)
const mod = await WebAssembly.compile(bytes)

// Stub every requested import. wasi libc paths the core touches (fopen for CD
// auto-detect) must fail *cleanly*: fd_prestat_get returns EBADF (8) so
// __wasilibc_populate_preopens stops scanning instead of trusting a bogus
// preopen; fopen then returns NULL and cdd_load falls through to load_archive.
// proc_exit must throw rather than silently no-op.
const WASI_EBADF = 8
const fn = (name) => {
  if (name === 'proc_exit') return (code) => { throw new Error(`wasi proc_exit(${code})`) }
  if (name === 'fd_prestat_get' || name === 'fd_prestat_dir_name') return () => WASI_EBADF
  return () => 0
}
const imports = {}
for (const imp of WebAssembly.Module.imports(mod)) {
  ;(imports[imp.module] ??= {})[imp.name] =
    imp.kind === 'function' ? fn(imp.name) : imp.kind === 'memory'
      ? new WebAssembly.Memory({ initial: 512 })
      : imp.kind === 'global' ? new WebAssembly.Global({ value: 'i32', mutable: true }, 0) : 0
}

const { exports } = await WebAssembly.instantiate(mod, imports)
exports._initialize?.()

const M68K_REG_D0 = 0, M68K_REG_PC = 16

// Minimal 1KB MD ROM (big-endian, as a real cartridge dump).
const rom = new Uint8Array(0x400)
const be32 = (off, v) => { rom[off] = v >>> 24; rom[off+1] = v >>> 16; rom[off+2] = v >>> 8; rom[off+3] = v }
be32(0x000, 0x00FFFFFE)              // initial SSP (top of work RAM)
be32(0x004, 0x00000200)              // reset PC -> $200
for (let i = 0; i < 16; i++) rom[0x100 + i] = 'SEGA GENESIS    '.charCodeAt(i) // console name
rom.set([0x20, 0x3C, 0x12, 0x34, 0x56, 0x78], 0x200) // move.l #$12345678,d0
rom.set([0x60, 0xFE], 0x206)                          // bra.s self

exports.init()
const romPtr = exports.rom_ptr()
// init() may have grown wasm memory — take the view afterward (and never cache it
// across a call that can grow the heap).
new Uint8Array(exports.memory.buffer).set(rom, romPtr)
const ok = exports.load_rom_buffer(rom.length)

const pcAfterReset = exports.get_reg(M68K_REG_PC) >>> 0
exports.run_frame()
exports.run_frame()
const d0 = exports.get_reg(M68K_REG_D0) >>> 0
const byte200 = exports.read_byte(0x200) >>> 0 // expect $20 (first opcode byte) off the bus

console.log(`load_rom_buffer: ${ok} (expect 1)`)
console.log(`PC after reset:  $${pcAfterReset.toString(16).padStart(6, '0')} (expect $000200)`)
console.log(`D0 after frames: $${d0.toString(16).padStart(8, '0')} (expect $12345678)`)
console.log(`read_byte($200): $${byte200.toString(16).padStart(2, '0')} (expect $20)`)
console.log(`framebuffer:     ${exports.fb_width()}x${exports.fb_height()} @ pitch ${exports.fb_pitch()}`)

if (ok !== 1 || pcAfterReset !== 0x200 || d0 !== 0x12345678 || byte200 !== 0x20) {
  console.error('✗ genesis-gpgx smoke FAILED')
  process.exit(1)
}
console.log('✓ genesis-gpgx smoke OK')
