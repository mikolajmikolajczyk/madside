// Build a .z80 v2 snapshot for the ZX Spectrum 128K — the format the chips core
// loads (via zx_quickload) to place 8 RAM banks + the $7FFD paging state. The
// 48K .sna can't express 128K bank contents, so the banked zx128 build path
// emits this instead. Each RAM bank is one compressed "page" block.
//
// Reference: http://www.worldofspectrum.org/faq/reference/z80format.htm

const BANK_SIZE = 0x4000

/** RLE-compress a bank as z80-format expects: a run of >=5 equal bytes (or >=2
 *  of $ED, which is the escape byte) becomes `ED ED count value`; everything
 *  else is literal. A lone $ED is emitted raw — safe because a run of 1 means
 *  the following byte differs, so no spurious `ED ED` pair forms. */
function compressPage(data: Uint8Array): number[] {
  const out: number[] = []
  let i = 0
  while (i < data.length) {
    const b = data[i]!
    let run = 1
    while (i + run < data.length && data[i + run] === b && run < 255) run++
    if (run >= 5 || (b === 0xed && run >= 2)) {
      out.push(0xed, 0xed, run, b)
    } else {
      for (let k = 0; k < run; k++) out.push(b)
    }
    i += run
  }
  return out
}

export interface Z80SnapshotInput {
  /** Start PC (the program entry). */
  pc: number
  /** Initial value of port $7FFD (which RAM bank is paged into $C000 at boot,
   *  bit 4 = ROM select). Bits 0-2 = bank. */
  port7ffd: number
  /** RAM bank index (0-7) → 16 KB image. Banks not given default to zero-filled
   *  (the core also zero-inits RAM). Bank 5 = $4000 screen, bank 2 = $8000. */
  banks: Map<number, Uint8Array>
  /** Stack pointer (defaults to $BFFE — top of the $8000 bank). */
  sp?: number
}

/** Assemble a 128K .z80 v2 snapshot. */
export function buildZ80Snapshot(input: Z80SnapshotInput): Uint8Array {
  const sp = input.sp ?? 0xbffe
  // v1 (30-byte) header. PC = 0 signals a v2/v3 file (real PC is in the ext
  // header). I = $3F, IM 1 — a sane default for a fresh program.
  const h = new Uint8Array(30)
  h[8] = sp & 0xff
  h[9] = (sp >> 8) & 0xff
  h[10] = 0x3f // I
  h[29] = 1 // flags1: interrupt mode 1

  // v2 extended header (length 23): PC, hw_mode (3 = 128K), out $7FFD, then the
  // fields chips reads (out $FFFD + AY registers, left zero).
  const ext: number[] = [
    23, 0,
    input.pc & 0xff, (input.pc >> 8) & 0xff,
    3, // hw_mode 3 = ZX Spectrum 128K
    input.port7ffd & 0xff,
    0, // rom1
    0, // flags
    0, // out $FFFD
    ...new Array(16).fill(0), // AY registers
  ]

  const pages: number[] = []
  for (const [bank, data] of [...input.banks.entries()].sort(([a], [b]) => a - b)) {
    const img = data.length === BANK_SIZE ? data : (() => {
      const b = new Uint8Array(BANK_SIZE)
      b.set(data.subarray(0, BANK_SIZE))
      return b
    })()
    const comp = compressPage(img)
    // page block: length (compressed), page number (bank + 3).
    pages.push(comp.length & 0xff, (comp.length >> 8) & 0xff, bank + 3, ...comp)
  }

  return Uint8Array.from([...h, ...ext, ...pages])
}
