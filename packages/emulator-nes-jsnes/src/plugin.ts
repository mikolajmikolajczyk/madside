// jsnes registered as an EmulatorPlugin. The backend (jsnes core) is a separate
// code-split chunk; `createBackend` lazy-imports it so jsnes loads only when a
// NES project actually boots — importing this module is cheap.

import type { EmulatorPlugin } from "@ports";

export const jsnesEmulator: EmulatorPlugin = {
  id: "jsnes",
  kind: "emulator",
  name: "jsnes (NES)",
  // NES bank windows are derived from the loaded mapper inside the backend, not
  // from a static machine declaration (ADR-0014) — so the `banks` arg is unused.
  createBackend: async () => (await import("./jsnes-backend")).createJsnesBackend(),
};
