// First-run resolution. Loads the deep-linked / persisted-active / first
// existing project, or returns null when storage is empty. No auto-seed — an
// empty store stays empty until the user picks a template (App renders the
// welcome picker for the null case). Out-of-the-box projects live in
// templates/ now (see src/app/templates.ts), not here.

import { getActiveProjectId, listProjects, loadProject, type LoadedProject } from "./project";

export async function ensureActiveProject(preferredId?: string): Promise<LoadedProject | null> {
  // E2E + deep-link entry point: URL-supplied id wins if it resolves.
  if (preferredId) {
    const p = await loadProject(preferredId);
    if (p) return p;
  }
  const activeId = await getActiveProjectId();
  if (activeId) {
    const p = await loadProject(activeId);
    if (p) return p;
  }
  // Otherwise open the first existing project; empty store → null (picker).
  const all = await listProjects();
  if (all.length > 0) {
    const p = await loadProject(all[0].id);
    if (p) return p;
  }
  return null;
}
