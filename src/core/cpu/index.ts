// CPU instruction vocabularies, resolved by MachinePlugin.cpu. The editor
// language + label scanner read opcodes/docs for the active machine's CPU
// instead of a hardcoded MADS table (epic 78b12bf). New CPUs register a
// CpuLanguage here; toolchains contribute directives/syntax separately.

import { MOS6502 } from "./mos6502";
import type { CpuLanguage } from "./mos6502";

export type { CpuLanguage, OpcodeDoc } from "./mos6502";
export { MOS6502 } from "./mos6502";

const REGISTRY: Record<string, CpuLanguage> = {
  "mos6502": MOS6502,
  "ricoh-2a03": MOS6502, // NES 2A03 = official 6502 instruction set
  // "mos6510": MOS6502, // C64 (future)
};

/** Resolve the instruction vocabulary for a CPU id, or undefined if unknown. */
export function getCpuLanguage(cpuId: string): CpuLanguage | undefined {
  return REGISTRY[cpuId];
}
