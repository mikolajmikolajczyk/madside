# Interactive courses: bundled content, persistent lesson projects, declarative checks

**Date:** 2026-06-14
**Decider:** Mikołaj
**Tags:** feature-architecture | content-pipeline

## Context

v0.9.5 added in-app interactive courses (course → lessons, the guided-learning
counterpart to the static docs). Three design choices weren't recorded: where
course content lives, how opening a lesson relates to the project system, and
how a lesson's task is verified.

## Decision

1. **Content is in-repo, bundled via Vite glob** — `courses/<id>/` (course.json
   + `lessons/<nn>-<slug>/{lesson.md, files/, check.json, solution/}`), loaded
   by `import.meta.glob` exactly like `templates/`. No separate repo, offline,
   always available. Lesson order comes from the `<nn>-` directory prefix, so
   there's no second list to drift from disk.
2. **A lesson is a persistent project, not a throwaway.** `openLesson()` reuses
   the project already in storage for that lesson (learner edits survive
   navigating away and back), else instantiates the starter `files/`. The
   project carries its identity in `manifest.course = { id, lesson }` (a new
   optional manifest field), so *course mode* and the lesson panel derive purely
   from the active project — no separate global session state to persist.
3. **Checks are declarative JSON, evaluated by a pure engine.** `check.json`
   lists assertions; `check-runner.ts` splits into a pure `evaluateChecks`
   (over a materialised build + register/memory snapshot) and an orchestrator
   that assembles and, only when needed, runs headlessly. v1 kinds: `build`,
   `label`, `register`, `memory`. `framebuffer-colour` and JS check modules are
   deferred.

## Alternatives considered

- **Separate courses repo / CDN** — lost: breaks offline, adds hosting; glob
  bundling already proven by templates.
- **Throwaway project per lesson open** — lost: destroys learner edits on nav.
- **`course` tracked in a side IDB store** — lost: stamping the manifest makes
  the active project self-describing and survives reload for free.
- **JS check modules in v1** — lost: arbitrary code in bundled content is a
  bigger surface than declarative assertions need; declarative covers the
  sample course.

## Trigger to revisit

Community-authored courses (→ revisit in-repo bundling + the JS-check security
surface). Checks that declarative JSON can't express (→ JS check modules).
Per-course progress / resume-to-next-incomplete still depends on a persisted
completion signal from the runner — not yet built.
