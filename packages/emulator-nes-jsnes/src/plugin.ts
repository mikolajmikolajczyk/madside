// jsnes registered as an EmulatorPlugin. The backend (jsnes core) is a separate
// code-split chunk; `createBackend` lazy-imports it so jsnes loads only when a
// NES project actually boots — importing this module is cheap.

import type { BankWindow, EmulatorPlugin } from "@ports";

export const jsnesEmulator: EmulatorPlugin = {
  id: "jsnes",
  kind: "emulator",
  name: "jsnes (NES)",
  createBackend: async (banks?: readonly BankWindow[]) =>
    (await import("./jsnes-backend")).createJsnesBackend(banks),
};
