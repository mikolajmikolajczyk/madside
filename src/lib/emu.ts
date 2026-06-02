// Public entrypoint for the emulator. Returns an `EmuBackend` — UI code uses
// only that interface. Swapping in a different backend (e.g. Altirra wasm) is
// a one-import change here.

import { AltirraBackend } from "./emu/backends/altirra";
import type { EmuBackend } from "./emu/backend";

export type { CpuRegs, EmuBackend } from "./emu/backend";

export async function createEmu(): Promise<EmuBackend> {
  return AltirraBackend.create();
}
