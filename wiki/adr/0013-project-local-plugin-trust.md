# ADR-0013: Trust model for project-local plugins (consent + content-hash + sandbox)

- **Status:** Accepted
- **Date:** 2026-06-23
- **Deciders:** Mikołaj
- **Tags:** security, plugins, courses, editors, converters

## Context

Two plugin kinds are **project-local**: visual editors (`editors/*.js`) and asset
converters (`converters/*.js`). Unlike built-in plugins, their code ships *inside a
project* and is loaded at runtime via Blob URL + dynamic `import()` on the page's
main thread — so it runs with **full origin capabilities** (DOM, storage, network,
cookies). Converters auto-run during a build (recipes); editors mount when a
matching file opens.

That code reaches a user three ways, and today they're handled **incoherently**:

| Channel | Today | Treated as |
|---------|-------|------------|
| Hand-written in your project | runs | trusted |
| **Project ZIP import** | runs **silently** | trusted (no check) |
| **Course (remote GitHub repo)** | **blocked** (`validateCourseFiles` rejects + `openLesson` strips `editors/`/`converters/`) | untrusted |

This is wrong in both directions:

- **ZIP import is a silent XSS hole.** A shared `.zip` can carry `editors/evil.js`
  that executes on our origin the moment the project opens — no warning. The
  "ZIP = your own work" assumption isn't enforced; a malicious shared zip is as
  dangerous as a hostile URL.
- **The course block kills functionality.** Courses can't ship plugin starters,
  demos, or working examples — so the IDE's extensibility story (the whole asset
  pipeline + visual editors) doesn't reach courses. You can't ship a converter to
  teach the asset pipeline, or a skeleton editor to teach editor authoring.
  (Learners can still *hand-write* plugins in a lesson project — the loader isn't
  course-gated — but a course can't *deliver* the code.)

The blanket-block (courses) and blanket-allow (zip) are both blunt. The real axis
isn't the *channel* — it's whether the **specific code** is trusted.

## Decision drivers

- **Coherent across all three channels** — one rule for hand-written / zip /
  course, not three.
- **Safe against untrusted code** — imported plugin JS must not run on our origin
  without informed consent, and even then with limited blast radius.
- **Keep functionality** — courses and zips *can* carry plugins; the extensibility
  story reaches them.
- **Don't nag** — re-importing the same zip, or seeing a plugin you already
  vetted, must not re-prompt. Trust the *code*, persist it.

## Considered options

1. **Block project-local plugins everywhere.** Coherent + safe, but rips the
   converter/editor functionality out of zip + course (and the existing built-in
   project-plugin feature). Rejected — too much capability lost.
2. **Allow everywhere (status quo for zip).** Functional but a standing XSS hole
   for shared zips + remote courses. Rejected.
3. **Trust by source** (bundled/local trusted, remote blocked). Breaks
   *portability*: a converter an author trusts locally is blocked for the learner
   who installs the published course — the course doesn't work for its audience.
   Rejected.
4. **Consent + content-hash trust + sandbox (chosen).** Trust the *code* (by hash)
   with the user's consent, persisted so it's asked once; run consented code
   sandboxed for defense-in-depth. Standard dev-tool pattern (VS Code Workspace
   Trust, extension permissions).

## Decision outcome

**Project-local plugins are untrusted by default and run only after consent, keyed
on the plugin's content hash, with consented code executed sandboxed.**

**Consent gate.** When a project is imported (zip) or a course is installed/opened,
its `editors/*.js` + `converters/*.js` are detected. A plugin runs only once the
user has trusted it:

- A converter recipe doesn't run an untrusted converter; a matching file opens in
  the plain text editor (not the untrusted editor) with a "trust to enable" prompt.
- The prompt names the plugin(s) and offers per-plugin Trust / Skip. Import/open
  itself never blocks — only plugin *execution* is gated.

**Trust is keyed on the content hash, persisted globally.** Trust records are
`sha256(plugin source)` (reusing the hash the plugin loader already computes), in a
persistent store. Therefore:

- Re-importing the same zip, or the same plugin code appearing in another project →
  **already-trusted hash → runs, no prompt.**
- A **changed** plugin (new hash — e.g. a refreshed course swapped the code) →
  re-prompts. This is exactly the security-relevant case.

**Provenance shortcut.** Creating or editing a plugin in-app auto-trusts its
current hash (your own keystrokes are consent). Imported plugins start untrusted.

**Defense-in-depth: sandbox consented plugins (least privilege).** Even after
consent, plugin code runs sandboxed so a mis-click can't reach the origin:

- **Converters** are pure transforms (`convert(bytes, opts) → bytes`, no DOM/net by
  contract) → run in a **no-capability Web Worker** (no fetch/storage/DOM; CPU
  timeout). Safe even untrusted.
- **Editors** need DOM (`mount(container, ctx)`) → run in a **null-origin
  `sandbox="allow-scripts"` iframe** with a `postMessage` bridge exposing only the
  `EditorContext` it needs (`value` / `onChange` / `assets`), never the host origin.

**Built-in plugins** (shipped with the app — the bitmap editor, `bin-to-incbin`,
`csv-to-data`) are trusted and need no consent.

**This replaces the channel-specific handling:** `validateCourseFiles` no longer
rejects plugin directories and `openLesson` no longer strips them — courses may
ship plugins, gated by the same consent + sandbox as zips; and the silent
ZIP-plugin execution is closed by the same gate.

Rules, restated so they can't drift:

> **Imported plugin code never runs without consent.** Detected on import/open,
> gated until trusted, keyed on content hash.
>
> **Trust the code, not the channel — and persist it.** A vetted hash runs
> everywhere without re-prompting; only a changed hash re-asks.
>
> **Consent is not the only wall.** Consented plugins still run sandboxed
> (converter → worker, editor → iframe), exposed only the data they need.

## Consequences

**Positive**
- One coherent rule across hand-written / zip / course; the ZIP XSS hole closes and
  the course functionality gap closes at the same time.
- Courses + zips can carry converters/editors (teach + demo the asset pipeline and
  editor authoring) — safely.
- No nag: content-hash trust means re-imports and shared code are silent once vetted.
- Defense-in-depth: even a wrongly-trusted plugin is boxed (no origin access).

**Negative / risks**
- Consent fatigue — users click "trust" reflexively. Mitigated by (a) content-hash
  no-nag (fewer prompts), (b) the sandbox capping blast radius regardless.
- The sandbox is real work — a worker RPC for converters and an iframe + postMessage
  host for editors (essentially a small webview system). Phased after the consent
  gate.
- Interim (consent shipped, sandbox not yet): a *consented* plugin runs main-thread
  with full capability — the VS Code "trusted = full access" interim. Acceptable
  with informed consent; P2 reduces it.

## Rollout

1. **P1 — consent gate + content-hash trust store (#142).** Detect plugins on
   import/open, prompt per-plugin, persist trusted hashes globally, gate execution.
   Remove the blanket course strip/reject. (Makes the model coherent + safe +
   functional.)
2. **P2 — sandbox hosts (#143).** Converter → no-capability Worker; editor →
   null-origin iframe + `postMessage` `EditorContext` bridge. Defense-in-depth.

Relates to ADR-0003 (plugin host model), ADR-0004 (error boundaries — the same
untrusted-content posture), the remote-course trust model
(`wiki/decisions/2026-06-14-remote-courses-trust-model.md`, which this supersedes
for plugin code), and #139 (courses). Reuses `@core/hash` `sha256Hex` (already used
by the plugin loader's content cache).
