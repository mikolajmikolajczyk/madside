// MADS-specific extra mnemonics beyond the official 6502 set: MADS
// pseudo-instructions (convenience macros the assembler expands) + the
// undocumented/illegal 6502 opcodes MADS assembles. Recognized by the LSP as
// opcodes so they highlight, hover, complete, and don't read as undefined
// symbols. Same shape as the CPU opcode table.

import { cpuOpcodes, type OpcodeInfo } from './types'

const PSEUDO: Record<string, OpcodeInfo> = {
  MVA: { desc: 'MADS: move byte (lda src / sta dst)', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  MVX: { desc: 'MADS: move byte via X (ldx / stx)', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  MVY: { desc: 'MADS: move byte via Y (ldy / sty)', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  MWA: { desc: 'MADS: move word (16-bit, low + high byte)', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  MWX: { desc: 'MADS: move word via X', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  MWY: { desc: 'MADS: move word via Y', flags: 'N Z', modes: [{ mode: 'move', syntax: 'src dst' }] },
  INW: { desc: 'MADS: increment word (16-bit)', flags: 'N Z', modes: [{ mode: 'memory', syntax: 'addr' }] },
  DEW: { desc: 'MADS: decrement word (16-bit)', flags: 'N Z', modes: [{ mode: 'memory', syntax: 'addr' }] },
  ADW: { desc: 'MADS: add word (16-bit)', flags: 'N V Z C', modes: [{ mode: 'memory', syntax: 'addr value' }] },
  SBW: { desc: 'MADS: subtract word (16-bit)', flags: 'N V Z C', modes: [{ mode: 'memory', syntax: 'addr value' }] },
  JEQ: { desc: 'MADS: long jump if equal (Z set)', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JNE: { desc: 'MADS: long jump if not equal (Z clear)', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JCC: { desc: 'MADS: long jump if carry clear', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JCS: { desc: 'MADS: long jump if carry set', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JVC: { desc: 'MADS: long jump if overflow clear', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JVS: { desc: 'MADS: long jump if overflow set', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JMI: { desc: 'MADS: long jump if minus (N set)', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  JPL: { desc: 'MADS: long jump if plus (N clear)', flags: '', modes: [{ mode: 'jump', syntax: 'label' }] },
  PHR: { desc: 'MADS: push A, X, Y', flags: '', modes: [] },
  PLR: { desc: 'MADS: pull A, X, Y', flags: 'N Z', modes: [] },
}

// Undocumented/illegal 6502 opcodes (MADS assembles them); all share a generic
// hint since their exact effects are stable but rarely portable.
const ILLEGAL = ['SLO', 'RLA', 'SRE', 'RRA', 'SAX', 'LAX', 'DCP', 'ISB', 'ANC', 'ALR', 'ARR', 'ANE', 'LXA', 'SBX', 'SHA', 'SHX', 'SHY', 'TAS', 'LAS']
const illegalInfo: Record<string, OpcodeInfo> = {}
for (const op of ILLEGAL) illegalInfo[op] = { desc: 'Undocumented 6502 opcode', flags: 'N Z', modes: [] }

export const MADS_EXTRAS = cpuOpcodes({ ...PSEUDO, ...illegalInfo })
