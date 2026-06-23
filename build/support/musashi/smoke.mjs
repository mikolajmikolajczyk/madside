// Smoke test for musashi.wasm (#145, Phase A): hand-build a tiny ROM that loads
// $12345678 into D0, run it, and check the register. Validates the reactor's
// exported API end-to-end (init / load_rom / reset / run_cycles / get_reg) +
// the memory bus (ROM fetch, vector table reset).
import { readFile } from 'node:fs/promises'

const wasmPath = process.argv[2]
const bytes = await readFile(wasmPath)
const mod = await WebAssembly.compile(bytes)

// The core may import a few wasi functions (libc printf paths it never hits in a
// clean run). Stub every requested import with a no-op so instantiation succeeds.
const imports = {}
for (const imp of WebAssembly.Module.imports(mod)) {
  ;(imports[imp.module] ??= {})[imp.name] =
    imp.kind === 'function' ? () => 0 : imp.kind === 'memory'
      ? new WebAssembly.Memory({ initial: 256 })
      : imp.kind === 'global' ? new WebAssembly.Global({ value: 'i32', mutable: true }, 0) : 0
}

const { exports } = await WebAssembly.instantiate(mod, imports)
exports._initialize?.() // wasi reactor init (ctors / libc)

const mem = new Uint8Array(exports.memory.buffer)
const M68K_REG_D0 = 0, M68K_REG_PC = 16

// ROM: vector table (SSP, reset PC) + code.
const rom = [
  0x00, 0xFF, 0xFF, 0xFC,             // $0: initial SSP
  0x00, 0x00, 0x00, 0x08,             // $4: reset PC -> $8
  0x20, 0x3C, 0x12, 0x34, 0x56, 0x78, // $8: move.l #$12345678,d0
  0x60, 0xFE,                         // $E: bra.s self
]

const romPtr = exports.rom_ptr()
mem.set(rom, romPtr)

exports.init()
exports.load_rom(rom.length) // records length + pulses reset (fetches SSP/PC)

const pcAfterReset = exports.get_reg(M68K_REG_PC) >>> 0
exports.run_cycles(200)
const d0 = exports.get_reg(M68K_REG_D0) >>> 0

console.log(`PC after reset: $${pcAfterReset.toString(16).padStart(6, '0')} (expect $000008)`)
console.log(`D0 after run:   $${d0.toString(16).padStart(8, '0')} (expect $12345678)`)

if (pcAfterReset !== 0x8 || d0 !== 0x12345678) {
  console.error('✗ musashi smoke FAILED')
  process.exit(1)
}
console.log('✓ musashi smoke OK')
