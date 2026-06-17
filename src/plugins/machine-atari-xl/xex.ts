// Atari executable (XEX / Atari DOS binary) load-range parser (#30). Lives with
// the Atari machine plugin, which exposes it through MachinePlugin.
// programLoadRange — XEX knowledge stays in the platform that owns the format,
// not in the generic check-runner path. Other platforms supply their own range
// hint (or none: NES seeds PC from the reset vector, so it runs straight from
// load).
//
// The check-runner advances a headless run for `afterFrames` frames, but a
// loaded XEX doesn't execute the user's code until the OS has cold-booted and
// jumped to the program (tens of frames). To make `afterFrames` mean "frames
// after the program starts" — what authors expect — the runner first advances
// until the CPU's PC enters the program's loaded address range. This parses
// that range straight from the binary (Altirra loads the XEX internally and
// doesn't hand back the run address).
//
// XEX format: an optional repeated `$FFFF` marker, then segments of
//   startAddr(2, LE)  endAddr(2, LE)  data[end-start+1]
// A segment loading `$02E0/$02E1` is RUNAD (the run address); `$02E2/$02E3` is
// INITAD. Those control segments don't hold program code, so they're excluded
// from the PC range (but RUNAD is captured as the entry point).

export interface XexLoadRange {
  /** Lowest load address of a code/data segment. */
  lo: number
  /** Highest load address (inclusive). */
  hi: number
  /** RUNAD entry point, when the binary specifies one. */
  runAddr?: number
}

const RUNAD = 0x02e0
const INITAD = 0x02e3

/** Parse the program's loaded address span from an Atari XEX. Returns null when
 *  the bytes aren't a recognizable XEX (e.g. an iNES ROM) so callers can fall
 *  back to the old fixed-frame behaviour. */
export function parseXexLoadRange(bytes: Uint8Array): XexLoadRange | null {
  const n = bytes.length
  if (n < 6) return null
  const rd16 = (i: number) => bytes[i] | (bytes[i + 1] << 8)

  // A binary load file must open with the $FFFF header.
  if (rd16(0) !== 0xffff) return null

  let p = 2
  let lo = 0x10000
  let hi = -1
  let runAddr: number | undefined

  while (p + 4 <= n) {
    let start = rd16(p)
    // $FFFF separators may repeat before a segment header.
    while (start === 0xffff) {
      p += 2
      if (p + 4 > n) return finish(lo, hi, runAddr)
      start = rd16(p)
    }
    const end = rd16(p + 2)
    p += 4
    if (end < start) return finish(lo, hi, runAddr) // malformed — stop here
    const dataStart = p
    p += end - start + 1

    // Capture RUNAD if this segment covers $02E0.
    if (start <= RUNAD && end >= RUNAD + 1) {
      const off = dataStart + (RUNAD - start)
      if (off + 1 < n) runAddr = bytes[off] | (bytes[off + 1] << 8)
    }

    // A segment that lives entirely in the RUNAD/INITAD control area carries no
    // program code — keep it out of the executable range.
    const controlOnly = start >= RUNAD && end <= INITAD
    if (!controlOnly) {
      if (start < lo) lo = start
      if (end > hi) hi = end
    }

    if (p > n) break // truncated final segment
  }

  return finish(lo, hi, runAddr)
}

function finish(lo: number, hi: number, runAddr?: number): XexLoadRange | null {
  if (hi >= lo) return { lo, hi, runAddr }
  // Only control segments present — fall back to a single-point range at the
  // entry, if any.
  if (runAddr !== undefined) return { lo: runAddr, hi: runAddr, runAddr }
  return null
}
