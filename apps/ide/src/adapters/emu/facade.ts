// Public entrypoint for the emulator. Returns a `RunBackend` (the canonical port
// contract) — swapping in a different backend is a one-import change here.

import { AltirraBackend } from "./altirra";
import type { BankWindow, RunBackend } from "@ports";

export type { CpuRegs } from "./backend";

export async function createEmu(banks?: readonly BankWindow[]): Promise<RunBackend> {
  return AltirraBackend.create(banks);
}
