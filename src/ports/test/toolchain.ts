// Contract harness for ToolchainPlugin authors (ADR-0005). One-line drop-in:
//
//   import { assertToolchainPlugin } from '@ports/test/toolchain'
//   import { myToolchain } from './my-toolchain'
//   import { describe, it } from 'vitest'
//
//   describe('my-toolchain satisfies ToolchainPlugin', () => {
//     it('contract', () => assertToolchainPlugin(myToolchain, { source: { ... } }))
//   })
//
// External plugin authors get this harness for free. Built-in plugins use it
// to flag drift between contract and impl. The harness exits via Vitest
// `expect` assertions — any violation surfaces as a normal test failure.

import { expect } from 'vitest'
import type { ToolchainPlugin } from '../plugin-toolchain'

export interface ToolchainHarnessFixture {
  /** A minimal source set the plugin must accept. Path uses one of the
   *  plugin's `inputExt` so the toolchain considers it a source file. */
  source: { path: string; content: Uint8Array }
  /** Optional source set the plugin must reject (parse error, undefined
   *  symbol, etc.). Skipped when absent — but external authors are strongly
   *  encouraged to supply one. */
  badSource?: { path: string; content: Uint8Array }
  /** Project id forwarded to the plugin. Default: 'test-harness'. */
  projectId?: string
}

/** Full contract check — static shape + build round-trip. Throws via
 *  `expect` on first violation. Async because the plugin's `build` is. */
export async function assertToolchainPlugin(
  plugin: ToolchainPlugin,
  fixture: ToolchainHarnessFixture,
): Promise<void> {
  // --- Static shape ---
  expect(plugin.id, 'id must be a kebab-case ascii slug').toMatch(/^[a-z][a-z0-9-]*$/)
  expect(plugin.name, 'name must be non-empty').toBeTypeOf('string')
  expect(plugin.name.length).toBeGreaterThan(0)
  expect(Array.isArray(plugin.inputExt) || typeof plugin.inputExt === 'object').toBe(true)
  expect(plugin.inputExt.length, 'inputExt must list at least one extension').toBeGreaterThan(0)
  for (const ext of plugin.inputExt) {
    expect(ext, `inputExt entry '${ext}': lowercase, no dot`).toMatch(/^[a-z0-9]+$/)
  }
  expect(plugin.outputExt, 'outputExt: lowercase, no dot').toMatch(/^[a-z0-9]+$/)
  expect(typeof plugin.build, 'build must be a function').toBe('function')

  const projectId = fixture.projectId ?? 'test-harness'

  // --- Build round-trip on minimal source ---
  const out = await plugin.build({
    projectId,
    main: fixture.source.path,
    files: [fixture.source],
  })
  expect(out.ok, `build() failed on minimal source — stderr: ${out.stderr}`).toBe(true)
  expect(out.exitCode, 'successful build must report exitCode 0').toBe(0)
  expect(out.binary, 'successful build must return a binary').toBeInstanceOf(Uint8Array)
  expect(out.binary!.byteLength, 'binary must be non-empty').toBeGreaterThan(0)
  expect(typeof out.stdout).toBe('string')
  expect(typeof out.stderr).toBe('string')

  // sourceMap is optional but, when present, must shape correctly.
  if (out.sourceMap) {
    expect(out.sourceMap.addrToLoc).toBeInstanceOf(Map)
    expect(out.sourceMap.locToAddr).toBeInstanceOf(Map)
  }
  // labels likewise.
  if (out.labels) expect(out.labels).toBeInstanceOf(Map)

  // --- Failure-path round-trip (optional fixture) ---
  if (fixture.badSource) {
    const fail = await plugin.build({
      projectId,
      main: fixture.badSource.path,
      files: [fixture.badSource],
    })
    expect(fail.ok, 'build() must return ok:false on invalid source').toBe(false)
    expect(fail.exitCode, 'failed build must report non-zero exitCode').not.toBe(0)
    expect(fail.binary, 'failed build must not return a binary').toBeUndefined()
  }
}
