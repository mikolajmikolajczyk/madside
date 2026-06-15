# Plan — Welcome screen redesign (progressive disclosure + featured courses)

Status: planned. Owner: Mikołaj. Target component: `src/ui/components/Welcome.tsx` (+ `Welcome.css`).

## Goal

The welcome screen is the project hub (reachable on first run + via **File → New project**). Today it dumps every section fully expanded — projects, empty-project form, all templates, all courses — which is long and noisy. Redesign it for **progressive disclosure**: show a little, expand on demand.

> **Scope note:** *featured courses* (a curated catalog of course repos shown as suggestions) is a **separate effort, not started** — out of scope here. This plan only restructures the existing sections; the courses section keeps its current content (installed + bundled + add-from-GitHub).

## Target layout (top → bottom)

1. **Your projects** — the **2 most recent**, then a **"more"** toggle revealing the rest. (Hidden entirely when there are no projects.)
2. **Empty project** — **collapsed** by default (just a header/affordance); clicking slides the `project.json` form (`ManifestEditor`) into view + the **Create** button.
3. **Templates** — first **2** cards, then **"more"** for the rest.
4. **Courses** — current content (bundled + installed-remote courses + the **"Add course from GitHub"** input), optionally with the same 2 + more disclosure. *(Featured/curated courses = separate future effort, not here.)*

## Section specs

### 1. Your projects (2 + more)
- Props already supply `projects: { id; name }[]`. **Order by most-recent** — currently `project.projects` order; ensure it's sorted by `updatedAt` desc (the store's `projects` is `ProjectRow[]` with `updatedAt`; App passes `{id,name}` — extend to pass/sort by recency, or sort in the store).
- Render `projects.slice(0, 2)`; if `projects.length > 2`, a **"more (N)"** button toggles `showAllProjects` to render the rest.
- Card click → `onOpen(id)` (unchanged).

### 2. Empty project (collapsed → expand)
- Replace the always-visible form with a collapsible: a header row "Empty project" + a chevron / "New empty project" button.
- Local state `emptyOpen` (default `false`). When open, render the `ManifestEditor` (`welcome__manifest`) + **Create project** button.
- **Slide animation**: wrap the body in a container with a CSS `max-height` + `opacity` transition (collapsed `max-height: 0; overflow: hidden`). `ManifestEditor` is lazy/heavy — only mount it when `emptyOpen` (so the CodeMirror chunk loads on expand, not on welcome paint). Acceptable: the slide animates the wrapper; the editor pops in once loaded.

### 3. Templates (2 + more)
- `templates` already excludes `empty`. Render `templates.slice(0, 2)`; **"more (N)"** toggles `showAllTemplates`.
- Card behavior unchanged (`pick(id)` → `instantiateTemplate` → `onOpen`).

### 4. Courses (unchanged content)
- Keep current behavior: **bundled** courses (`source.kind === 'bundled'`, e.g. atari-basics) + **installed remote** courses (`source.kind === 'github'`, with **×** remove) + the **"Add course from GitHub"** input (`repoInput` + `addCourse`). No structural change required.
- Optional: apply the same **2 + more** disclosure if the list grows long. Low priority.

> **Featured courses (separate, not started):** a curated catalog of suggested course repos shown as install-me cards. When that effort starts it can add a static `src/app/featured-courses.ts` (inline `{repo,title,description,machine}`, rendered instantly, install-on-click via `installCourseFromGitHub`, de-duped vs installed). **Out of scope for this redesign.**

## Reusable disclosure helper

Three sections share the "first N + more" pattern. Either:
- inline `useState` per section (simplest, ~3 small states), or
- a tiny `useDisclosure(items, n)` hook returning `{ visible, hasMore, expanded, toggle }`, or a `<ShowMore n=…>` wrapper.
Recommend the small hook to keep `Welcome.tsx` tidy. CSS: one `.welcome__more` button style.

## Files to touch

- `src/ui/components/Welcome.tsx` — restructure sections, disclosure state, featured courses, collapsible empty.
- `src/ui/components/Welcome.css` — `.welcome__more`, collapsible empty (`max-height` transition), featured-card tweaks.
- `src/ui/App.tsx` — pass projects **sorted by recency** (and possibly full list, since Welcome now caps to 2 itself). Confirm `project.projects` carries `updatedAt`; if `{id,name}` loses it, pass `{id,name,updatedAt}` and sort in Welcome.
- Docs: `docs/src/content/docs/using/projects.md` (welcome hub description) + `using/courses.md` (featured courses) — update once shipped.
- Tests: the `installCourseFromGitHub` path is covered; add nothing heavy. Maybe a small unit test for `useDisclosure` if added.

## Steps

1. Add the disclosure helper (hook) + `.welcome__more` CSS.
2. Welcome: Your projects → 2 + more (sort by recency).
3. Welcome: Empty project → collapsible + slide; lazy-mount `ManifestEditor` on open.
4. Welcome: Templates → 2 + more.
5. App: pass recency-sorted projects.
6. Typecheck / lint / build / docs build; eyeball; commit.

(Courses section unchanged. Featured courses = separate later effort.)

## Open questions

- **"More" count** — 2 everywhere per the request; courses left as-is for now.
- **Empty-project affordance copy** — "New empty project" button vs a chevron header.
- **Projects recency** — is `ProjectRow.updatedAt` enough, or track "last opened" separately? (updatedAt is fine for v1.)
