// Altirra registered as an EmulatorPlugin. The wasm core stays an adapter (the
// vendored Emscripten build under ./wasm); this is the thin, port-facing
// wrapper the workbench registers and resolves like any other plugin. Why this
// lives in @adapters while jsnes is a @plugins plugin: wiki/decisions/
// 2026-06-16-emulator-layer-placement.md (wasm/native glue = adapter; pure-JS
// lib = plugin).
//
// `createBackend` lazy-imports the facade so the ~4.5 MB core is fetched only
// when an Atari project actually boots — importing this module is cheap.

import type { BankWindow, EmulatorPlugin } from "@ports";

export const altirraEmulator: EmulatorPlugin = {
  id: "altirra-wasm",
  kind: "emulator",
  name: "Altirra (Atari 8-bit)",
  async createBackend(banks?: readonly BankWindow[]) {
    const { createEmu } = await import("./facade");
    // AltirraBackend implements RunBackend directly now (#16) — no cast. The
    // machine's bank-window declaration (ADR-0014) drives the backend's
    // bankMap(); the app layer passes it (adapters can't import the machine
    // plugin). Flat 800XL projects carry none.
    return createEmu(banks);
  },
};
