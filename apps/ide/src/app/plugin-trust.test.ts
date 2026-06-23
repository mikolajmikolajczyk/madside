import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "@adapters/storage-memory";
import {
  PLUGIN_FILE_RE,
  filterTrustedConverterFiles,
  isTrustedHash,
  partitionPlugins,
  pluginFiles,
  pluginHash,
  trustPluginHash,
  untrustedPlugins,
} from "./plugin-trust";

// ADR-0013 P1 — content-hash plugin trust. Note: the trusted set is module-global
// (a session singleton), so each test uses *unique* plugin source to avoid a hash
// trusted in one test leaking into another.

const enc = new TextEncoder();

describe("plugin-trust", () => {
  it("PLUGIN_FILE_RE matches one-level editors/ + converters/ .js only", () => {
    expect(PLUGIN_FILE_RE.test("editors/sprite.js")).toBe(true);
    expect(PLUGIN_FILE_RE.test("converters/tiles.js")).toBe(true);
    expect(PLUGIN_FILE_RE.test("editors/deep/x.js")).toBe(false); // nested
    expect(PLUGIN_FILE_RE.test("editors/x.ts")).toBe(false); // not .js
    expect(PLUGIN_FILE_RE.test("src/main.a65")).toBe(false);
  });

  it("pluginFiles keeps only project-local plugin files", () => {
    const files = [
      { path: "src/main.a65" },
      { path: "editors/a.js" },
      { path: "converters/b.js" },
      { path: "readme.md" },
    ];
    expect(pluginFiles(files).map((f) => f.path)).toEqual(["editors/a.js", "converters/b.js"]);
  });

  it("untrusted by default; trusting the content hash unlocks it; changed content re-locks", async () => {
    const storage = createMemoryStorage();
    const src = { path: "converters/uniqA.js", content: "export default 'A'" };

    const before = await partitionPlugins([src]);
    expect(before.trusted).toHaveLength(0);
    expect(before.untrusted).toHaveLength(1);
    const hash = await pluginHash(src.content);
    expect(before.untrusted[0]!.hash).toBe(hash);
    expect(isTrustedHash(hash)).toBe(false);

    await trustPluginHash(storage, hash);
    expect(isTrustedHash(hash)).toBe(true);

    const after = await partitionPlugins([src]);
    expect(after.trusted.map((s) => s.path)).toEqual(["converters/uniqA.js"]);
    expect(after.untrusted).toHaveLength(0);

    // Different content → different hash → untrusted again (the refresh-swap case).
    const changed = { path: "converters/uniqA.js", content: "export default 'A2'" };
    expect((await partitionPlugins([changed])).untrusted).toHaveLength(1);
  });

  it("filterTrustedConverterFiles drops untrusted converters, keeps everything else", async () => {
    const storage = createMemoryStorage();
    const files = [
      { path: "src/main.a65", content: enc.encode("; x") },
      { path: "converters/uniqB.js", content: enc.encode("export default 'B'") },
    ];
    expect((await filterTrustedConverterFiles(storage, files)).map((f) => f.path)).toEqual(["src/main.a65"]);

    await trustPluginHash(storage, await pluginHash(files[1]!.content));
    expect((await filterTrustedConverterFiles(storage, files)).map((f) => f.path)).toContain("converters/uniqB.js");
  });

  it("untrustedPlugins lists the unconsented plugins in a project's files", async () => {
    const storage = createMemoryStorage();
    const files = [
      { path: "src/main.a65", content: enc.encode("; x") },
      { path: "editors/uniqC.js", content: enc.encode("export default 'C'") },
    ];
    const u = await untrustedPlugins(storage, files);
    expect(u.map((p) => p.path)).toEqual(["editors/uniqC.js"]);
  });

  it("trust persists to storage.kv", async () => {
    const storage = createMemoryStorage();
    const hash = await pluginHash("export default 'persist-uniqD'");
    await trustPluginHash(storage, hash);
    expect(await storage.kv.getTrustedPluginHashes()).toContain(hash);
  });
});
