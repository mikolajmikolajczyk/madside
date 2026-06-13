// First-run bootstrap: if no project exists, create "sandbox" with seed files.

import { MANIFEST_VERSION } from "@ports";
import { createProject, getActiveProjectId, getMeta, listProjects, loadProject, MANIFEST_PATH, setMeta, textToBytes, type LoadedProject } from "./project";
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

// === NES sample (machine:'nes', toolchain:'mads') ===
// MADS assembles a valid NROM iNES directly — `opt h-` for raw output, a
// hand-rolled 16-byte iNES header contiguous before PRG, the PRG padded to
// 16 KB. CHR-ROM banks = 0 → the cart uses CHR-RAM, so the file carries no CHR
// (drops an 8 KB MADS fill that the wasm build assembles slowly). The program
// does the canonical NES warmup (two VBlank waits), writes the universal
// background colour, and enables rendering, so the canvas shows a solid colour
// — proof the machine + jsnes backend + MADS path work end-to-end. Verified.
const SEED_NES_HELLO = `; minimalny przykład NES — wypełnia ekran kolorem tła przez PPU
        icl 'nes.a65'           ; PPU/APU equates
        opt h-                  ; headerless raw output (iNES, nie XEX)

; --- iNES header (16B), contiguous przed PRG ---
        org $bff0
        dta c"NES",$1a
        dta $01                 ; PRG 16KB
        dta $00                 ; CHR 0 → CHR-RAM (brak CHR-ROM w pliku)
        dta $00,$00             ; mapper 0 NROM
        dta $00,$00,$00,$00,$00,$00,$00,$00

; --- PRG-ROM 16KB ---
        org $c000
reset
        sei
        cld
        ldx #$40
        stx $4017               ; wyłącz APU frame IRQ
        ldx #$ff
        txs
        inx                     ; x=0
        stx PPUCTRL             ; NMI off
        stx PPUMASK             ; rendering off
        stx $4010               ; DMC IRQ off

vwait1  bit PPUSTATUS           ; czekaj 1. vblank (PPU warmup)
        bpl vwait1
vwait2  bit PPUSTATUS           ; czekaj 2. vblank
        bpl vwait2

        lda #$3f                ; palette addr $3F00 (universal bg)
        sta PPUADDR
        lda #$00
        sta PPUADDR
        lda #$21                ; jasnoniebieski
        sta PPUDATA

        lda #$00                ; reset scroll + addr latch
        sta PPUSCROLL
        sta PPUSCROLL
        sta PPUADDR
        sta PPUADDR

        lda #%00011110          ; PPUMASK: pokaż bg + sprite
        sta PPUMASK

forever jmp forever

nmi     rti
irq     rti
        :$fffa-* dta $ff        ; pad PRG do wektorów ($fffa)
        dta a(nmi)
        dta a(reset)
        dta a(irq)
; CHR-RAM (CHR banks=0) — brak CHR-ROM w pliku, PPU pattern w RAM
`;

// Parallel copy of @plugins/machine-nes/machine-nes.ts::machineNes.bootEquates
// (ADR-0002 — the adapter cannot import @plugins). Drift guarded by the
// machine-nes-boot-equates contract test.
const SEED_NES_EQUATES = `; common NES register equates
PPUCTRL   = $2000
PPUMASK   = $2001
PPUSTATUS = $2002
OAMADDR   = $2003
OAMDATA   = $2004
PPUSCROLL = $2005
PPUADDR   = $2006
PPUDATA   = $2007
OAMDMA    = $4014
APUSTATUS = $4015
JOY1      = $4016
JOY2      = $4017
`;
/** Exposed only for the contract test that catches drift vs
 *  machineNes.bootEquates. Do not consume from app code. */
export const SEED_NES_EQUATES_FOR_TESTS = SEED_NES_EQUATES;

const SEED_NES_MANIFEST: Manifest = {
  version: MANIFEST_VERSION,
  name: "nes-sample",
  main: "src/nes-hello.a65",
  machine: "nes",
  toolchain: "mads",
  run: { default: { audio: true } },
};

const META_SEEDED_NES = "seeded:nes-sample";

// Create the NES sample once, tracked by a meta flag so it appears alongside
// the sandbox on existing installs too — and a later deletion sticks (the flag
// stays set, no resurrection on next load).
async function ensureNesSample(): Promise<void> {
  if (await getMeta(META_SEEDED_NES)) return;
  await createProject(
    SEED_NES_MANIFEST.name,
    [
      { path: "src/nes-hello.a65", content: textToBytes(SEED_NES_HELLO) },
      { path: "src/nes.a65", content: textToBytes(SEED_NES_EQUATES) },
      { path: MANIFEST_PATH, content: textToBytes(JSON.stringify(SEED_NES_MANIFEST, null, 2) + "\n") },
    ],
    SEED_NES_MANIFEST,
  );
  await setMeta(META_SEEDED_NES, true);
}

export async function ensureActiveProject(preferredId?: string): Promise<LoadedProject> {
  const active = await resolveActiveProject(preferredId);
  // Seed the NES sample alongside whatever's active (idempotent, deletion-safe).
  await ensureNesSample();
  return active;
}

async function resolveActiveProject(preferredId?: string): Promise<LoadedProject> {
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
  // Fall back to any existing project, or seed the Atari sandbox.
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
