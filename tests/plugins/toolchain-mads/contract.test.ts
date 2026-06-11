// Drives the MADS plugin through the shared ToolchainPlugin contract harness.
// Node test env doesn't ship a /wasm/mads.wasm URL — we shim global.fetch so
// the plugin's loader (`fetch("/wasm/mads.wasm")`) resolves to the file on
// disk under public/wasm/.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, it } from 'vitest'
import { assertToolchainPlugin } from '@ports/test'
import { madsToolchain } from '@plugins/toolchain-mads'

const WASM_PATH = fileURLToPath(new URL('../../../public/wasm/mads.wasm', import.meta.url))

const HELLO = `        org $2000
start
        lda #$00
        sta $80
        rts
        run start
`

const BROKEN = `        org $2000
        @@@ this is not a valid MADS directive
`

describe('madsToolchain — ToolchainPlugin contract', () => {
  let originalFetch: typeof globalThis.fetch | undefined

  beforeAll(() => {
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url === '/wasm/mads.wasm' || url.endsWith('/wasm/mads.wasm')) {
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
    await assertToolchainPlugin(madsToolchain, {
      source: { path: 'src/hello.a65', content: new TextEncoder().encode(HELLO) },
      badSource: { path: 'src/broken.a65', content: new TextEncoder().encode(BROKEN) },
    })
  })
})
