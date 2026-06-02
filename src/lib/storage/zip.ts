// Project ZIP import/export. `fflate` for tiny sync zip codec (~20KB).
// Export excludes generated/ — those are reproducible by the asset pipeline.

import { unzipSync, zipSync } from "fflate";
import { createProject, listProjects, loadProject, MANIFEST_PATH, textToBytes, bytesToText } from "./project";
import type { Manifest, ProjectRow } from "./types";

const GENERATED_DIR = "generated/";

export async function exportProjectToZip(id: string): Promise<Uint8Array> {
  const loaded = await loadProject(id);
  if (!loaded) throw new Error(`project ${id} not found`);
  const entries: Record<string, Uint8Array> = {};
  for (const f of loaded.files) {
    if (f.path.startsWith(GENERATED_DIR)) continue;
    entries[f.path] = f.content;
  }
  return zipSync(entries, { level: 6 });
}

export async function importProjectFromZip(zip: Uint8Array, fallbackName: string): Promise<ProjectRow> {
  const raw = unzipSync(zip);
  // Drop empty directory entries (some zippers add them).
  const entries: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(raw)) {
    if (name.endsWith("/")) continue;
    entries[name.replace(/^\/+/, "")] = data;
  }

  let manifest: Manifest;
  if (entries[MANIFEST_PATH]) {
    try {
      manifest = JSON.parse(bytesToText(entries[MANIFEST_PATH])) as Manifest;
    } catch {
      manifest = synthesizeManifest(entries, fallbackName);
    }
  } else {
    manifest = synthesizeManifest(entries, fallbackName);
    entries[MANIFEST_PATH] = textToBytes(JSON.stringify(manifest, null, 2) + "\n");
  }

  const allProjects = await listProjects();
  const taken = new Set(allProjects.map((p) => p.name));
  const name = uniquify(manifest.name || fallbackName, taken);
  if (name !== manifest.name) {
    manifest.name = name;
    entries[MANIFEST_PATH] = textToBytes(JSON.stringify(manifest, null, 2) + "\n");
  }

  const files = Object.entries(entries)
    .filter(([p]) => p !== MANIFEST_PATH)
    .map(([path, content]) => ({ path, content }));
  return createProject(name, files, manifest);
}

function synthesizeManifest(entries: Record<string, Uint8Array>, fallbackName: string): Manifest {
  const sourceCandidate = Object.keys(entries).find((p) => /\.(a65|asm)$/i.test(p) && !p.startsWith(GENERATED_DIR));
  return {
    version: 1,
    name: fallbackName,
    main: sourceCandidate ?? "src/main.asm",
    run: { default: { audio: true } },
  };
}

function uniquify(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const m = /^(.*?)(?:\s*\((\d+)\))?$/.exec(name);
  const base = (m?.[1] ?? name).trim();
  let n = m?.[2] ? parseInt(m[2], 10) + 1 : 2;
  while (taken.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}
