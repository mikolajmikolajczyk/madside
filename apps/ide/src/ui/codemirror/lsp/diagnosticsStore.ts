import type { BuildDiagnostic } from "@ports";

// Worker-free store for the LSP's analysis-driven semantic diagnostics (#77).
// The C language server pushes textDocument/publishDiagnostics on every edit;
// the (lazy, worker-heavy) LSP client writes them here, and the app reads +
// merges them with its own build diagnostics. Keeping the store separate lets
// the app subscribe without statically importing the worker client.
//
// madside never pushes build output to the server (it parses cc65/ca65/ld65
// itself), so what lands here is purely *semantic* (undeclared id, bad member,
// …) — complementary to the build diagnostics, not a duplicate of them.

const byPath = new Map<string, BuildDiagnostic[]>();
const subscribers = new Set<() => void>();
const EMPTY: BuildDiagnostic[] = [];

/** Replace the semantic diagnostics for `path` and notify subscribers. An empty
 *  list clears the entry (a clean re-analysis drops stale squiggles). */
export function setLspDiagnostics(path: string, diags: BuildDiagnostic[]): void {
  if (diags.length === 0) byPath.delete(path);
  else byPath.set(path, diags);
  for (const cb of subscribers) cb();
}

export function getLspDiagnostics(path: string): BuildDiagnostic[] {
  return byPath.get(path) ?? EMPTY;
}

export function subscribeLspDiagnostics(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
