# Remote courses are data, not code — trust model

**Date:** 2026-06-14
**Decider:** Mikołaj
**Tags:** security | feature-architecture

## Context

Epic `ecd5258` lets a learner install a course from any public GitHub repo by
pasting a URL. That means running content authored by strangers. We need a clear,
defensible answer to "what can a malicious course repo do?" before shipping it.

## Decision

Remote courses are treated as **data, not code**, and the install path enforces
that:

- **Markdown** (`lesson.md`) renders through react-markdown with **no raw-HTML
  plugin** (no `rehype-raw`) → no script/HTML injection from lesson text.
- **Source files** (`.a65` etc.) are only ever assembled by the local MADS wasm
  (a sandbox) and run on the emulator core — nothing from the repo executes as
  JavaScript in the app.
- **Checks** (`check.json`) are **declarative** (`build`/`label`/`register`/
  `memory`) and evaluated by our own runner. No code from the repo runs.
- **No plugins from repos.** A course may not contribute machine/toolchain/
  emulator/panel/etc. plugins; those stay built-in or project-local Blob-URL
  only (ADR-0003). Courses contribute content only.
- **Install-time validation** (`validateCourseFiles`): the fetched files must
  have a valid `course.json` (title + machine), at least one `lesson.md`, and
  well-formed `check.json`; size/count caps (≤1000 files, ≤100 lessons, ≤8 MB)
  guard against oversized/abusive repos. Malformed → rejected with a message,
  not silently loaded.

## Alternatives considered

- **JS check modules** (arbitrary check logic from the repo) — rejected for v1:
  executing repo-authored JS is exactly the code surface we're avoiding.
  Declarative checks cover the need.
- **Allow `rehype-raw` for richer lessons** — rejected: opens HTML/script
  injection for marginal authoring benefit.
- **Sanitize-and-trust everything** — unnecessary: the data-not-code boundary
  is simpler to reason about than a sanitizer allowlist.

## Trigger to revisit

Community demand for richer/interactive lesson content (→ reconsider a sandboxed
JS check API, e.g. in a Worker). Fetching from hosts beyond GitHub (Phase 2,
`8b96cf8`) — a CORS proxy adds an SSRF surface that needs its own allowlist.
Ref pinning: a moving branch can change content under a learner; recommend
authors tag releases (documented in the publish guide).
