import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { completeAt, indexC, type CIndex } from '../src/engine'

// Fixtures-based completion-quality harness (#4). Each `fixtures/*.c` is a
// self-contained cc65 snippet with a single `|` marking the cursor and a
// directive describing the expected completions:
//   // @expect-all: a, b        completion labels must be exactly {a, b}
//   // @expect-includes: a, b    completion labels must include a and b
// The runner strips the `|`, indexes the file, runs `completeAt` at the marker,
// and scores each fixture. A measurable pass-rate is asserted so resolver
// changes can't silently regress; a deliberate break (below) drops it.

interface Fixture {
  name: string
  /** Source with the `|` marker removed. */
  source: string
  /** Cursor offset (where `|` was). */
  offset: number
  expected: string[]
  mode: 'all' | 'includes'
}

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url))

function loadFixtures(): Fixture[] {
  return readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.c'))
    .map((file) => {
      const raw = readFileSync(`${fixturesDir}/${file}`, 'utf8')
      const offset = raw.indexOf('|')
      if (offset < 0) throw new Error(`${file}: missing | cursor marker`)
      const source = raw.slice(0, offset) + raw.slice(offset + 1)
      const all = /(?:^|\n)\/\/ @expect-all:\s*(.+)/.exec(raw)
      const inc = /(?:^|\n)\/\/ @expect-includes:\s*(.+)/.exec(raw)
      const spec = all ?? inc
      if (!spec) throw new Error(`${file}: missing @expect directive`)
      const expected = spec[1]!
        .trim()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      return { name: file, source, offset, expected, mode: all ? 'all' : 'includes' }
    })
}

// The fixtures are cc65 snippets, so the harness blanks cc65's
// calling-convention decorators (the engine default blanks nothing).
const CC65_DECORATORS = /\b(?:__fastcall__|__cdecl__)\b/g

function passes(fx: Fixture, index: CIndex): boolean {
  const labels = completeAt(index, fx.source, fx.offset, CC65_DECORATORS).map((c) => c.label)
  if (fx.mode === 'all') {
    return labels.length === fx.expected.length && fx.expected.every((e) => labels.includes(e))
  }
  return fx.expected.every((e) => labels.includes(e))
}

const fixtures = loadFixtures()
const indexFor = (fx: Fixture): CIndex =>
  indexC([{ path: fx.name, text: fx.source }], { decorators: CC65_DECORATORS })

describe('completion-quality harness', () => {
  it('discovers fixtures', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8)
  })

  // Per-fixture cases give a readable failure when one regresses.
  for (const fx of fixtures) {
    it(`completes: ${fx.name}`, () => {
      expect(passes(fx, indexFor(fx))).toBe(true)
    })
  }

  it('asserts an overall pass-rate above the regression threshold', () => {
    const passed = fixtures.filter((fx) => passes(fx, indexFor(fx))).length
    const rate = passed / fixtures.length
    expect(rate).toBeGreaterThanOrEqual(0.9)
  })

  // Sensitivity check: an empty index (a stand-in for a broken resolver) must
  // tank the pass-rate — proving the harness actually catches regressions.
  it('drops the pass-rate when the index is broken', () => {
    const broken = indexC([])
    const passed = fixtures.filter((fx) => passes(fx, broken)).length
    expect(passed / fixtures.length).toBeLessThan(0.9)
  })
})
