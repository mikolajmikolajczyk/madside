// Drives the clownassembler plugin through the shared ToolchainPlugin contract
// harness. Node test env can't serve the Vite `?url` asset — we shim global.fetch
// so the plugin's loader resolves to the wasm on disk.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { assertToolchainPlugin } from '@ports/test'
import { clownassemblerToolchain } from '@madside/toolchain-clownassembler'

const WASM_PATH = fileURLToPath(
  new URL('../../../packages/wasm-clownassembler/clownassembler.wasm', import.meta.url),
)

const HELLO = `	move.w	#$1234,d0
	rts
`

const BROKEN = `	@@@ this is not valid m68k
`

describe('clownassemblerToolchain — ToolchainPlugin contract', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('clownassembler.wasm')) {
        const bytes = await readFile(WASM_PATH)
        return new Response(bytes, { status: 200, headers: { 'content-type': 'application/wasm' } })
      }
      if (originalFetch) return originalFetch(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })

  afterAll(() => {
    if (originalFetch) globalThis.fetch = originalFetch
  })

  it('passes the harness on a minimal source + a broken source', async () => {
    await assertToolchainPlugin(clownassemblerToolchain, {
      source: { path: 'src/hello.asm', content: new TextEncoder().encode(HELLO) },
      badSource: { path: 'src/broken.asm', content: new TextEncoder().encode(BROKEN) },
    })
  })
})
