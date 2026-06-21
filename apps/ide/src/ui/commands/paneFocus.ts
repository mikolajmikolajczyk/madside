// Tiling-WM-style directional focus between the main UI regions (#27). Each
// region root carries `data-focus-region`; Alt+Shift+Arrow moves focus to the
// nearest region in that direction, scored geometrically (i3/sway-style) so the
// behaviour survives layout changes (course-mode splits, panel rearrangements)
// without a hardcoded adjacency table.

export type FocusDirection = "left" | "right" | "up" | "down";

interface Point {
  x: number;
  y: number;
}

const centerOf = (el: HTMLElement): Point => {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const isVisible = (el: HTMLElement) => el.offsetWidth > 0 && el.offsetHeight > 0;

// Remember the last region focus was in, so a directional move still has a
// sensible origin when focus has drifted onto the document body / a toolbar
// button (which belong to no region). Lazily wired on first use.
let lastRegion: HTMLElement | null = null;
let tracking = false;
function ensureTracking(): void {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener("focusin", (e) => {
    const r = (e.target as HTMLElement | null)?.closest?.("[data-focus-region]");
    if (r) lastRegion = r as HTMLElement;
  });
}

/** Move keyboard focus to the nearest focus-region in `dir` from the currently
 *  focused one. With nothing focused, focuses the first region in DOM order. */
export function focusPaneInDirection(dir: FocusDirection): void {
  ensureTracking();
  const regions = Array.from(
    document.querySelectorAll<HTMLElement>("[data-focus-region]"),
  ).filter(isVisible);
  if (regions.length === 0) return;

  const active = document.activeElement as HTMLElement | null;
  const current =
    (active ? regions.find((r) => r.contains(active)) : null) ??
    (lastRegion && regions.includes(lastRegion) ? lastRegion : null);
  if (!current) {
    focusRegion(regions[0]);
    return;
  }

  const horizontal = dir === "left" || dir === "right";
  const sr = current.getBoundingClientRect();
  const sc = centerOf(current);

  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of regions) {
    if (el === current) continue;
    const cr = el.getBoundingClientRect();
    const cc = centerOf(el);
    // Must lie in the requested direction (by center).
    const ahead =
      dir === "left" ? cc.x < sc.x - 1
      : dir === "right" ? cc.x > sc.x + 1
      : dir === "up" ? cc.y < sc.y - 1
      : cc.y > sc.y + 1;
    if (!ahead) continue;
    // Gap between the facing edges along the primary axis.
    const gap = Math.max(
      0,
      dir === "left" ? sr.left - cr.right
      : dir === "right" ? cr.left - sr.right
      : dir === "up" ? sr.top - cr.bottom
      : cr.top - sr.bottom,
    );
    // Overlap on the perpendicular axis. Regions that share the source's extent
    // (e.g. the full-height editor next to the emulator) are "in line" and win
    // over off-axis regions, regardless of centre alignment — this is what makes
    // emulator→left land on the editor, not the top-left file tree in course
    // mode where the tree is only half height.
    const overlap = horizontal
      ? Math.min(sr.bottom, cr.bottom) - Math.max(sr.top, cr.top)
      : Math.min(sr.right, cr.right) - Math.max(sr.left, cr.left);
    const misalign = overlap > 0 ? 0 : horizontal ? Math.abs(cc.y - sc.y) : Math.abs(cc.x - sc.x);
    const score = gap + misalign * 3;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) focusRegion(best);
}

// Preferred focus targets inside a region, in priority order. Tried one
// selector at a time — NOT as a single comma-list, because querySelector returns
// the first match in *document* order, which would pick the non-focusable
// `[role="tree"]` container over its focusable treeitem children.
const FOCUS_TARGETS = [
  "[data-focus-target]",
  ".cm-content",
  "canvas",
  '[role="treeitem"]',
  "button, a[href], input, select, textarea, [tabindex]",
];

/** Focus the most useful element inside a region, falling back to the region
 *  root itself (made focusable) so the move always lands somewhere and the
 *  :focus-within ring (CSS) lights up. */
function focusRegion(el: HTMLElement): void {
  for (const sel of FOCUS_TARGETS) {
    const target = el.querySelector<HTMLElement>(sel);
    if (!target) continue;
    target.focus();
    if (document.activeElement === target) return; // focus actually landed
  }
  // Nothing focusable inside — focus the region root so the move isn't a no-op.
  if (el.tabIndex < 0) el.tabIndex = -1;
  el.focus();
}
