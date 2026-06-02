// Recipe engine: for each recipe in project.json, read input file, run the
// converter, and write the output. Skip if the input bytes + canonical options
// haven't changed since last run (sha-256 cache keyed by [projectId, output]).

import { saveFile } from "../storage/project";
import { buildRegistry, type ProjectConverterSource } from "./registry";
import type { Recipe } from "./types";

export interface FileLike {
  path: string;
  content: Uint8Array;
}

const dec = new TextDecoder();

export interface RecipeResult {
  recipe: Recipe;
  ok: boolean;
  summary?: string;
  error?: string;
  output?: { path: string; bytes: Uint8Array };
  skipped?: boolean;
}

const hashCache = new Map<string, string>();   // key: projectId::output → "<inputHash>|<optsHash>"

function recipeKey(projectId: string, output: string) {
  return projectId + "::" + output;
}

async function sha256Hex(data: Uint8Array): Promise<string> {
  // Materialize a fresh ArrayBuffer copy so TS doesn't fret about
  // ArrayBuffer vs SharedArrayBuffer in the digest input type.
  const copy = new Uint8Array(data).buffer;
  const buf = await crypto.subtle.digest("SHA-256", copy);
  const arr = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i].toString(16).padStart(2, "0");
  return hex;
}

function canonicalize(opts: Record<string, unknown> | undefined): string {
  if (!opts) return "{}";
  const keys = Object.keys(opts).sort();
  const norm: Record<string, unknown> = {};
  for (const k of keys) norm[k] = opts[k];
  return JSON.stringify(norm);
}

export async function runRecipes(
  projectId: string,
  recipes: Recipe[],
  files: FileLike[],
): Promise<RecipeResult[]> {
  if (recipes.length === 0) return [];

  const fileByPath = new Map<string, FileLike>();
  for (const f of files) fileByPath.set(f.path, f);

  const converterSources: ProjectConverterSource[] = files
    .filter((f) => /^converters\/[^/]+\.js$/.test(f.path))
    .map((f) => ({ path: f.path, content: dec.decode(f.content) }));
  const registry = await buildRegistry(converterSources);

  const results: RecipeResult[] = [];

  for (const recipe of recipes) {
    const input = fileByPath.get(recipe.input);
    if (!input) {
      results.push({ recipe, ok: false, error: `input not found: ${recipe.input}` });
      continue;
    }
    const converter = registry.get(recipe.converter);
    if (!converter) {
      results.push({ recipe, ok: false, error: `converter not registered: ${recipe.converter}` });
      continue;
    }

    const inputBytes = input.content;
    const inputHash = await sha256Hex(inputBytes);
    const optsHash = await sha256Hex(new TextEncoder().encode(canonicalize(recipe.options)));
    const cacheKey = recipeKey(projectId, recipe.output);
    const fingerprint = inputHash + "|" + optsHash;
    if (hashCache.get(cacheKey) === fingerprint && fileByPath.has(recipe.output)) {
      results.push({ recipe, ok: true, skipped: true });
      continue;
    }

    try {
      const out = await converter.convert(inputBytes, recipe.options ?? {});
      await saveFile(projectId, recipe.output, out.bytes);
      hashCache.set(cacheKey, fingerprint);
      results.push({
        recipe,
        ok: true,
        summary: out.summary,
        output: { path: recipe.output, bytes: out.bytes },
      });
    } catch (e) {
      results.push({ recipe, ok: false, error: String(e) });
    }
  }
  return results;
}

export function clearRecipeCache(projectId?: string) {
  if (!projectId) { hashCache.clear(); return; }
  const prefix = projectId + "::";
  for (const k of [...hashCache.keys()]) if (k.startsWith(prefix)) hashCache.delete(k);
}
