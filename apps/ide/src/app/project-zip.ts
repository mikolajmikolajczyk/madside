// Project ZIP import/export, expressed purely over the StorageBackend port
// (load → files, list/create → import) so it works with any backend — no
// reach into a concrete adapter (ADR-0002, #16). `fflate` is a tiny sync zip
// codec (~20KB). Export excludes generated/ (reproducible by the asset pipeline).

import { unzipSync, zipSync } from "fflate";
import { MANIFEST_VERSION, parseProjectManifest } from "@ports";
import type { ProjectManifestV2 as Manifest, ProjectRow, StorageBackend } from "@ports";
import { MANIFEST_PATH, serializeManifest, uniquify } from "@madside/storage-shared";

const enc = new TextEncoder();
const dec = new TextDecoder();
const GENERATED_DIR = "generated/";

export async function exportProjectZip(storage: StorageBackend, id: string): Promise<Uint8Array> {
  const loaded = await storage.projects.load(id);
  if (!loaded) throw new Error(`project ${id} not found`);
  const entries: Record<string, Uint8Array> = {};
  for (const f of loaded.files) {
    if (f.path.startsWith(GENERATED_DIR)) continue;
    entries[f.path] = f.content;
  }
  return zipSync(entries, { level: 6 });
}

export async function importProjectZip(
  storage: StorageBackend,
  zip: Uint8Array,
  fallbackName: string,
): Promise<ProjectRow> {
  const raw = unzipSync(zip);
  // Drop empty directory entries (some zippers add them).
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(raw)) {
    if (name.endsWith("/")) continue;
    entries[name.replace(/^\/+/, "")] = data;
  }

  let manifest: Manifest;
  if (entries[MANIFEST_PATH]) {
    // v1 imports + malformed JSON surface to the caller so the UI can show the
    // ManifestError ('project.json v1 unsupported, recreate project').
    const parsed = parseProjectManifest(JSON.parse(dec.decode(entries[MANIFEST_PATH])));
    if (!parsed.ok) throw parsed.error;
    manifest = parsed.value;
  } else {
    manifest = synthesizeManifest(entries, fallbackName);
    entries[MANIFEST_PATH] = enc.encode(serializeManifest(manifest));
  }

  const taken = new Set((await storage.projects.list()).map((p) => p.name));
  const name = uniquify(manifest.name || fallbackName, taken);
  if (name !== manifest.name) {
    manifest.name = name;
    entries[MANIFEST_PATH] = enc.encode(serializeManifest(manifest));
  }

  const files = Object.entries(entries)
    .filter(([p]) => p !== MANIFEST_PATH)
    .map(([path, content]) => ({ path, content }));
  return storage.projects.create(name, files, manifest);
}

function synthesizeManifest(entries: Record<string, Uint8Array>, fallbackName: string): Manifest {
  const sourceCandidate = Object.keys(entries).find((p) => /\.(a65|asm)$/i.test(p) && !p.startsWith(GENERATED_DIR));
  return {
    version: MANIFEST_VERSION,
    name: fallbackName,
    main: sourceCandidate ?? "src/main.asm",
    machine: "atari-xl",
    toolchain: "mads",
    run: { default: { audio: true } },
  };
}
