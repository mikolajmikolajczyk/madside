import { describe, expect, it } from 'vitest'
import { gitBlobSha, pushFiles, type GhFetch } from '@madside/github-sync'

// Atomic push via the Git Data API (#160). The GhFetch is mocked with a tiny
// scripted GitHub; we assert the request sequence + the tree GitHub is asked to
// build (wholesale subtree replace: additions, deletions, blob reuse).

const enc = new TextEncoder()
const file = (path: string, text: string) => ({ path, content: enc.encode(text) })

interface TreeEntry { path: string; mode: string; type: string; sha: string | null }

interface MockOpts {
  /** null head = empty repo / unborn branch (bootstrap). */
  head?: { commitSha: string; treeSha: string; tree: { path: string; type: string; sha: string }[] } | null
  /** PATCH ref returns 422 this many times before succeeding (stale-ref retry). */
  refConflicts?: number
}

function mockRepo(opts: MockOpts) {
  let conflicts = opts.refConflicts ?? 0
  const calls: string[] = []
  let blobs = 0
  let lastTree: TreeEntry[] | null = null

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  const fetch: GhFetch = async (url, init) => {
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.replace('https://api.github.com', '')}`)

    if (method === 'GET' && /\/repos\/[^/]+\/[^/]+$/.test(url)) return json({ default_branch: 'main' })
    if (method === 'GET' && url.includes('/git/ref/heads/')) {
      return opts.head ? json({ object: { sha: opts.head.commitSha } }) : new Response('', { status: 404 })
    }
    if (method === 'GET' && url.includes('/git/commits/')) return json({ tree: { sha: opts.head!.treeSha } })
    if (method === 'GET' && url.includes('/git/trees/')) {
      return json({ sha: opts.head!.treeSha, tree: opts.head!.tree, truncated: false })
    }
    if (method === 'POST' && url.endsWith('/git/blobs')) return json({ sha: `newblob-${blobs++}` })
    if (method === 'POST' && url.endsWith('/git/trees')) {
      lastTree = (JSON.parse(init!.body as string) as { tree: TreeEntry[] }).tree
      return json({ sha: 'newtree' })
    }
    if (method === 'POST' && url.endsWith('/git/commits')) return json({ sha: 'newcommit' })
    if (method === 'PATCH' && url.includes('/git/refs/heads/')) {
      if (conflicts > 0) { conflicts--; return new Response('', { status: 422 }) }
      return json({ object: { sha: 'newcommit' } })
    }
    if (method === 'POST' && url.endsWith('/git/refs')) return json({ ref: 'refs/heads/main' }, 201)
    throw new Error(`unmocked ${method} ${url}`)
  }

  return { fetch, calls: () => calls, blobCount: () => blobs, tree: () => lastTree }
}

describe('pushFiles', () => {
  it('bootstraps an empty repo via the Contents API, then pushes the rest', async () => {
    // Empty repo: GET ref → 409 until a Contents PUT seeds the first commit;
    // then the loop finds the ref and pushes the full subtree via Git Trees.
    let seeded = false
    let putPath = ''
    let lastTree: TreeEntry[] | null = null
    const json = (b: unknown, s = 200) =>
      new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
    const fetch: GhFetch = async (url, init) => {
      const method = init?.method ?? 'GET'
      if (method === 'GET' && /\/repos\/[^/]+\/[^/]+$/.test(url)) return json({ default_branch: 'main' })
      if (method === 'GET' && url.includes('/git/ref/heads/')) {
        return seeded ? json({ object: { sha: 'seedcommit' } }) : new Response('', { status: 409 })
      }
      if (method === 'PUT' && url.includes('/contents/')) {
        seeded = true
        putPath = url
        return json({ commit: { sha: 'seedcommit' } }, 201)
      }
      if (method === 'GET' && url.includes('/git/commits/')) return json({ tree: { sha: 'seedtree' } })
      if (method === 'GET' && url.includes('/git/trees/')) {
        return json({ sha: 'seedtree', tree: [{ path: 'projects/p1/project.json', type: 'blob', sha: 'seedblob' }], truncated: false })
      }
      if (method === 'POST' && url.endsWith('/git/blobs')) return json({ sha: 'newblob' })
      if (method === 'POST' && url.endsWith('/git/trees')) {
        lastTree = (JSON.parse(init!.body as string) as { tree: TreeEntry[] }).tree
        return json({ sha: 'newtree' })
      }
      if (method === 'POST' && url.endsWith('/git/commits')) return json({ sha: 'newcommit' })
      if (method === 'PATCH' && url.includes('/git/refs/heads/')) return json({})
      throw new Error(`unmocked ${method} ${url}`)
    }
    const res = await pushFiles(
      fetch,
      { owner: 'me', repo: 'proj' },
      'projects/p1',
      [file('project.json', '{}'), file('src/main.a65', '; hi')],
      'init',
    )
    expect(res.created).toBe(true)
    expect(res.commitSha).toBe('newcommit')
    expect(putPath).toContain('/contents/projects/p1/project.json') // seeded the first file
    const tree = lastTree!
    expect(tree.map((e) => e.path).sort()).toEqual(['projects/p1/project.json', 'projects/p1/src/main.a65'])
  })

  it('replaces the subtree wholesale: deletes removed files, reuses unchanged blobs', async () => {
    const keepSha = await gitBlobSha(enc.encode('keep'))
    const m = mockRepo({
      head: {
        commitSha: 'head1',
        treeSha: 'tree1',
        tree: [
          { path: 'projects/p1/keep.txt', type: 'blob', sha: keepSha }, // unchanged → reused
          { path: 'projects/p1/gone.txt', type: 'blob', sha: 'old2' }, // removed → deleted
          { path: 'projects/other/x.txt', type: 'blob', sha: 'oth' }, // other subtree → untouched
        ],
      },
    })
    const res = await pushFiles(
      m.fetch,
      { owner: 'me', repo: 'proj', branch: 'main' },
      'projects/p1',
      [file('keep.txt', 'keep'), file('new.txt', 'new')],
      'update',
    )
    expect(res.created).toBe(false)
    const tree = m.tree()!
    const byPath = Object.fromEntries(tree.map((e) => [e.path, e]))
    // unchanged file reuses its existing blob sha (no upload for it)
    expect(byPath['projects/p1/keep.txt']!.sha).toBe(keepSha)
    // new file uploaded
    expect(byPath['projects/p1/new.txt']!.sha).toMatch(/^newblob-/)
    // removed file deleted (sha null)
    expect(byPath['projects/p1/gone.txt']!.sha).toBeNull()
    // other subtree NOT in the explicit entries (inherited via base_tree)
    expect(byPath['projects/other/x.txt']).toBeUndefined()
    // only the changed file was uploaded
    expect(m.blobCount()).toBe(1)
  })

  it('retries on a stale ref (422) then succeeds', async () => {
    const m = mockRepo({
      head: { commitSha: 'head1', treeSha: 'tree1', tree: [] },
      refConflicts: 1,
    })
    const res = await pushFiles(m.fetch, { owner: 'me', repo: 'proj' }, 'projects/p1', [file('a.txt', 'a')], 'msg')
    expect(res.commitSha).toBe('newcommit')
    // two PATCH attempts (first 422, second ok)
    expect(m.calls().filter((c) => c.startsWith('PATCH ')).length).toBe(2)
  })
})
