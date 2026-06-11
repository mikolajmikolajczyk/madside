// First-run bootstrap: if no project exists, create "sandbox" with seed files.

import { MANIFEST_VERSION } from "@ports";
import { createProject, getActiveProjectId, listProjects, loadProject, MANIFEST_PATH, textToBytes, type LoadedProject } from "./project";
import type { Manifest } from "./types";

const SEED_HELLO = `; minimalny przykład — pisze HELLO ATARI na ekran
        icl 'atari.a65'
        org $2000

screen = $80

start
        lda SAVMSC
        sta screen
        lda SAVMSC+1
        sta screen+1

        ldy #0
print
        lda hello_world,y
        cmp #$ff
        beq loop
        sta (screen),y
        iny
        jmp print
loop
        jmp loop

        run start

hello_world
        dta d'HELLO ATARI!', $ff
`;

// Parallel copy of @plugins/machine-atari-xl/atari-xl.ts::atariXl.bootEquates.
// The adapter cannot import from @plugins per ADR-0002; the duplicate
// disappears when v0.5.0 ToolchainPlugin work routes seed injection through
// workbench.machine.bootEquates and seed.ts moves to workbench-aware code.
const SEED_ATARI = `; common Atari OS equates
SAVMSC = $58
COLOR0 = $2C4
COLOR1 = $2C5
COLOR2 = $2C6
EOL    = $9B
`;
/** Exposed only for the contract test that catches drift vs
 *  atariXl.bootEquates. Do not consume from app code. */
export const SEED_ATARI_FOR_TESTS = SEED_ATARI;

const SEED_MANIFEST: Manifest = {
  version: MANIFEST_VERSION,
  name: "sandbox",
  main: "src/hello.a65",
  machine: "atari-xl",
  toolchain: "mads",
  run: { default: { audio: true } },
};

export async function ensureActiveProject(preferredId?: string): Promise<LoadedProject> {
  // E2E + deep-link entry point: URL-supplied id wins if it resolves to a real
  // project. Otherwise fall back to the persisted active id.
  if (preferredId) {
    const p = await loadProject(preferredId);
    if (p) return p;
  }
  const activeId = await getActiveProjectId();
  if (activeId) {
    const p = await loadProject(activeId);
    if (p) return p;
  }
  // Fall back to any existing project, or seed one.
  const all = await listProjects();
  if (all.length > 0) {
    const p = await loadProject(all[0].id);
    if (p) return p;
  }
  const project = await createProject(
    SEED_MANIFEST.name,
    [
      { path: "src/hello.a65", content: textToBytes(SEED_HELLO) },
      { path: "src/atari.a65", content: textToBytes(SEED_ATARI) },
      { path: MANIFEST_PATH, content: textToBytes(JSON.stringify(SEED_MANIFEST, null, 2) + "\n") },
    ],
    SEED_MANIFEST,
  );
  const loaded = await loadProject(project.id);
  if (!loaded) throw new Error("seed bootstrap failed: project not loadable after create");
  return loaded;
}
