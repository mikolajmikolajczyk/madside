// Declarative check runner (epic 2e9c7cc, child 29540fd). A lesson's task is
// validated by the checks in its check.json: the runner assembles the project,
// optionally runs it headlessly for a few frames, then evaluates each
// assertion and reports pass/fail with a per-assertion message.
//
// Two layers:
//   - evaluateCheck / evaluateChecks: PURE evaluation against a materialised
//     CheckContext (build outcome + symbol table + register/memory snapshot).
//     No I/O — fully unit-testable.
//   - runChecks: orchestrates the async side (assemble + run) through injected
//     CheckRunDeps, materialises the context, then evaluates. The UI supplies
//     deps backed by the workbench BuildService/RunService; tests supply fakes.
//
// Check kinds v1: build / label / register / memory. framebuffer-colour and JS
// check modules are deferred (epic decision).

import { byteHex } from '@core/hex'
import { errorMessage } from '@ports'
import type { CourseCheck } from './courses'

/** Parse a hex (`$94`, `0x94`) or decimal (`148`) literal to a number. */
export function parseNum(s: string): number {
  const t = s.trim()
  if (/^\$[0-9a-f]+$/i.test(t)) return parseInt(t.slice(1), 16)
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16)
  return parseInt(t, 10)
}

/** Parse a byte sequence (`$94`, `$94 $12`, `12, 34`) to numbers. */
export function parseBytes(s: string): number[] {
  return s.trim().split(/[\s,]+/).filter(Boolean).map(parseNum)
}

const hex = (n: number) => '$' + byteHex(n)
const hexBytes = (b: ArrayLike<number>) => Array.from(b, hex).join(' ')

/** Stable key for a materialised memory read (so the pure evaluator can look up
 *  a region the orchestrator pre-fetched). */
export function memKey(addr: number, len: number, space?: string): string {
  return `${space ?? 'cpu'}:${addr}:${len}`
}

/** Case-insensitive label lookup — toolchains differ on label casing in their
 *  symbol dump (MADS uppercases). Exact match wins, else first case-fold hit. */
function lookupLabel(labels: Map<string, number>, name: string): number | undefined {
  const exact = labels.get(name)
  if (exact !== undefined) return exact
  const lower = name.toLowerCase()
  for (const [k, v] of labels) if (k.toLowerCase() === lower) return v
  return undefined
}

/** Everything the pure evaluator needs, fully materialised (no I/O). */
export interface CheckContext {
  build: { ok: boolean; error?: string }
  /** Assembled symbol table (label name → address). */
  labels: Map<string, number>
  /** CPU registers after the run, by lowercase name (a/x/y/pc/sp). */
  regs?: Record<string, number>
  /** Pre-fetched memory regions, keyed by memKey(). */
  mem?: Map<string, Uint8Array>
  /** Set if the headless run threw. */
  runError?: string
}

export interface CheckResult {
  kind: CourseCheck['kind']
  pass: boolean
  /** Human-readable label of what was checked (for the panel). */
  label: string
  /** Pass/fail detail. */
  message: string
}

export interface CheckReport {
  pass: boolean
  results: CheckResult[]
}

const ok = (kind: CourseCheck['kind'], label: string, message: string): CheckResult =>
  ({ kind, pass: true, label, message })
const no = (kind: CourseCheck['kind'], label: string, message: string): CheckResult =>
  ({ kind, pass: false, label, message })

/** Evaluate one assertion against a materialised context. */
export function evaluateCheck(check: CourseCheck, ctx: CheckContext): CheckResult {
  switch (check.kind) {
    case 'build':
      return ctx.build.ok
        ? ok('build', 'builds', 'assembles cleanly')
        : no('build', 'builds', ctx.build.error ?? 'assembly failed')

    case 'label': {
      const label = `label \`${check.name}\``
      // MADS is case-insensitive and uppercases its label table (START), while
      // lessons author labels as written (start) — match case-insensitively.
      const addr = lookupLabel(ctx.labels, check.name)
      if (addr === undefined) return no('label', label, `not defined`)
      if (check.addr !== undefined) {
        const want = parseNum(check.addr)
        return addr === want
          ? ok('label', label, `defined at ${hex(addr)}`)
          : no('label', label, `at ${hex(addr)}, expected ${hex(want)}`)
      }
      return ok('label', label, `defined at ${hex(addr)}`)
    }

    case 'register': {
      const label = `register ${check.reg.toUpperCase()}`
      if (!ctx.regs) return no('register', label, ctx.runError ?? 'emulator state unavailable')
      const got = ctx.regs[check.reg]
      const want = parseNum(check.equals)
      if (got === undefined) return no('register', label, 'register not reported')
      return got === want
        ? ok('register', label, `= ${hex(got)}`)
        : no('register', label, `= ${hex(got)}, expected ${hex(want)}`)
    }

    case 'memory': {
      const want = parseBytes(check.equals)
      const at = parseNum(check.addr)
      const label = `memory ${check.addr}${check.space ? ` (${check.space})` : ''}`
      if (!ctx.mem) return no('memory', label, ctx.runError ?? 'emulator state unavailable')
      const got = ctx.mem.get(memKey(at, want.length, check.space))
      if (!got) return no('memory', label, 'region not read')
      const equal = got.length === want.length && want.every((b, i) => got[i] === b)
      return equal
        ? ok('memory', label, `= ${hexBytes(got)}`)
        : no('memory', label, `= ${hexBytes(got)}, expected ${hexBytes(want)}`)
    }
  }
}

/** Evaluate every assertion; the lesson passes only if all do. */
export function evaluateChecks(checks: CourseCheck[], ctx: CheckContext): CheckReport {
  const results = checks.map((c) => evaluateCheck(c, ctx))
  return { pass: results.every((r) => r.pass), results }
}

/** Async side, injected so the runner is testable without a real emulator. */
export interface CheckRunDeps {
  /** Assemble the project. */
  assemble(): Promise<{ ok: boolean; error?: string; labels: Map<string, number>; binary?: Uint8Array }>
  /** Load `binary`, advance `frames` display frames, expose register + memory
   *  reads. Only called when a register/memory check is present and the build
   *  succeeded. */
  run(binary: Uint8Array, frames: number): Promise<{
    regs: Record<string, number>
    readMem(addr: number, len: number, space?: string): Promise<Uint8Array> | Uint8Array
  }>
}

/** Whether a check needs the program to actually run. */
const needsRun = (c: CourseCheck) => c.kind === 'register' || c.kind === 'memory'

/** Assemble, run if needed, and evaluate. Pure evaluation is delegated to
 *  evaluateChecks; this function only marshals the async context. */
export async function runChecks(checks: CourseCheck[], deps: CheckRunDeps): Promise<CheckReport> {
  const asm = await deps.assemble()
  const ctx: CheckContext = { build: { ok: asm.ok, error: asm.error }, labels: asm.labels }

  if (asm.ok && asm.binary && checks.some(needsRun)) {
    const frames = checks.reduce((m, c) => (needsRun(c) && 'afterFrames' in c ? Math.max(m, c.afterFrames ?? 0) : m), 0)
    try {
      const r = await deps.run(asm.binary, frames)
      ctx.regs = r.regs
      const mem = new Map<string, Uint8Array>()
      for (const c of checks) {
        if (c.kind !== 'memory') continue
        const len = parseBytes(c.equals).length
        const at = parseNum(c.addr)
        mem.set(memKey(at, len, c.space), await r.readMem(at, len, c.space))
      }
      ctx.mem = mem
    } catch (e) {
      ctx.runError = errorMessage(e)
    }
  }

  return evaluateChecks(checks, ctx)
}
