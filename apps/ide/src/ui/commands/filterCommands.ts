// Pure command-palette query logic — split out so it's unit-testable without a
// DOM. `visibleCommands` applies the registry's `when(ctx)` gate; `fuzzyFilter`
// ranks by a subsequence match on the title.

import type { Command, CommandContext } from '@ports'

/** Commands runnable in the current context: `when(ctx)` true (or absent) and
 *  not in `exclude` (e.g. the palette-toggle command shouldn't list itself). */
export function visibleCommands(
  list: Command[],
  ctx: CommandContext,
  exclude: ReadonlySet<string> = new Set(),
): Command[] {
  return list.filter((c) => !exclude.has(c.id) && (!c.when || c.when(ctx)))
}

/** Subsequence fuzzy filter over command titles. Every query char must appear
 *  in order; results are ranked by an earlier + tighter match. An empty query
 *  returns the input order unchanged. */
export function fuzzyFilter(list: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase()
  if (!q) return list
  const scored: { c: Command; score: number }[] = []
  for (const c of list) {
    const score = fuzzyScore(c.title.toLowerCase(), q)
    if (score >= 0) scored.push({ c, score })
  }
  // Stable sort by score (lower = better); equal scores keep input order.
  return scored.map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.score - b.s.score || a.i - b.i)
    .map((x) => x.s.c)
}

/** Lower is better; -1 = no match. Rewards an early first hit and contiguous
 *  runs (gaps between matched chars add to the score). */
function fuzzyScore(text: string, q: string): number {
  let from = 0
  let first = -1
  let last = -1
  let gaps = 0
  for (const ch of q) {
    const idx = text.indexOf(ch, from)
    if (idx < 0) return -1
    if (first < 0) first = idx
    if (last >= 0) gaps += idx - last - 1
    last = idx
    from = idx + 1
  }
  return first + gaps
}
