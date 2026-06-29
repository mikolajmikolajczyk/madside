import { beforeEach, describe, expect, it } from "vitest";
import { pullProjectToIdb, projectRepo } from "./github-sync";
import { createMemoryStorage } from "../adapters/storage-memory";
import { toBase64, type GhFetch } from "@madside/github-sync";

// github-sync reads/writes its per-project metadata through the global
// localStorage (guarded by try/catch). Tests run headless (node), so provide a
// tiny in-memory stand-in rather than pulling in a DOM environment.
class MemLocalStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
(globalThis as unknown as { localStorage: MemLocalStorage }).localStorage = new MemLocalStorage();

// Per-project repo binding (import-from-another-repo). pullProjectToIdb must key
// a project by (repo, slug) — two repos can each hold a "game" project, and
// importing the second must NOT overwrite the first. Each gets its own binding.

const enc = new TextEncoder();
const MANIFEST = JSON.stringify({
  version: 2,
  name: "Game",
  main: "src/main.a65",
  machine: "atari-xl",
  toolchain: "mads",
  run: { default: { audio: false } },
});

/** A tiny scripted GitHub serving one project `projects/game/` in `owner/repo`. */
function repoMock(slug: string): GhFetch {
  const id = slug.replace("/", "_");
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const b64 = (s: string) => toBase64(enc.encode(s));
  return async (url, init) => {
    const method = init?.method ?? "GET";
    if (method === "GET" && /\/repos\/[^/]+\/[^/]+$/.test(url)) return json({ default_branch: "main" });
    if (url.includes("/git/ref/heads/")) return json({ object: { sha: `${id}-c1` } });
    if (url.includes("/git/commits/")) return json({ tree: { sha: `${id}-t1` }, parents: [] });
    if (url.includes("/git/trees/")) {
      return json({
        sha: `${id}-t1`,
        truncated: false,
        tree: [
          { path: "projects", type: "tree", sha: `${id}-pd`, mode: "040000" },
          { path: "projects/game", type: "tree", sha: `${id}-gd`, mode: "040000" },
          { path: "projects/game/project.json", type: "blob", sha: `${id}-m`, mode: "100644" },
          { path: "projects/game/src/main.a65", type: "blob", sha: `${id}-s`, mode: "100644" },
        ],
      });
    }
    if (url.endsWith(`/git/blobs/${id}-m`)) return json({ content: b64(MANIFEST), encoding: "base64" });
    if (url.endsWith(`/git/blobs/${id}-s`)) return json({ content: b64("; code"), encoding: "base64" });
    throw new Error(`unexpected request: ${method} ${url}`);
  };
}

describe("pullProjectToIdb — per-project repo binding", () => {
  beforeEach(() => localStorage.clear());

  it("imports the same slug from two repos as two distinct, separately-bound projects", async () => {
    const storage = createMemoryStorage();
    const a = await pullProjectToIdb(storage, repoMock("alice/r"), "alice/r", "game");
    const b = await pullProjectToIdb(storage, repoMock("bob/r"), "bob/r", "game");

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(b.projectId).not.toBe(a.projectId); // not merged into one
    expect(projectRepo(a.projectId)).toBe("alice/r");
    expect(projectRepo(b.projectId)).toBe("bob/r");
    expect((await storage.projects.list()).length).toBe(2);
  });

  it("re-importing the same (repo, slug) reconciles into the same project", async () => {
    const storage = createMemoryStorage();
    const first = await pullProjectToIdb(storage, repoMock("alice/r"), "alice/r", "game");
    const again = await pullProjectToIdb(storage, repoMock("alice/r"), "alice/r", "game");

    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.projectId).toBe(first.projectId);
    expect((await storage.projects.list()).length).toBe(1);
  });
});
