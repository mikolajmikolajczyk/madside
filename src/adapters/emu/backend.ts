// Altirra's CPU register snapshot — the shared 6502 shape. The backend contract
// itself is now the canonical @ports `RunBackend`; AltirraBackend implements it
// directly (the legacy `EmuBackend` superset interface + its `as unknown as`
// bridge were dropped in #16). Extra Altirra-only methods (setHardwareMode etc.)
// live on the concrete class and are reached via a narrowed cast at the one
// hardware-config site.

import type { Cpu6502State } from "@ports";

export type CpuRegs = Cpu6502State;
