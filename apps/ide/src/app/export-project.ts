// "Don't lose work" escape hatch for the root error boundary (ADR-0004 Level 1).
// Exports the URL-active project to a downloaded ZIP. No-throw by design — the
// caller is already in a crashed state.
//
// This is the one deliberate exception to storage DI (#16): the root boundary
// renders ABOVE <WorkbenchProvider>, so it can't read `workbench.storage` (the
// thing that may have crashed). It instantiates the default IDB backend directly.

import { createIdbStorage } from "@madside/storage-idb";
import { exportProjectZip } from "./project-zip";

function activeProjectId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("project") ?? undefined;
}

export async function exportActiveProjectToZip(): Promise<void> {
  try {
    const storage = createIdbStorage();
    const id = activeProjectId() ?? (await storage.projects.list())[0]?.id;
    if (!id) return;
    const bytes = await exportProjectZip(storage, id);
    const blob = new Blob([bytes as BlobPart], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${id}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.error("export-to-zip from error boundary failed", e);
  }
}
