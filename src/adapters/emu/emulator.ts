// Altirra registered as an EmulatorPlugin. The wasm core stays an adapter (the
// vendored Emscripten build under ./wasm); this is the thin, port-facing
// wrapper the workbench registers and resolves like any other plugin.
//
// `createBackend` lazy-imports the facade so the ~4.5 MB core is fetched only
// when an Atari project actually boots — importing this module is cheap.

import type { EmulatorPlugin, RunBackend } from "@ports";

export const altirraEmulator: EmulatorPlugin = {
  id: "altirra-wasm",
  kind: "emulator",
  name: "Altirra (Atari 8-bit)",
  async createBackend() {
    const { createEmu } = await import("./facade");
    // EmuBackend is Altirra's richer Embind surface; it satisfies RunBackend
    // structurally (width/height/pixels/loadMedia/step/…), but TS can't prove
    // the superset relation — assert it at this single boundary.
    return (await createEmu()) as unknown as RunBackend;
  },
};
