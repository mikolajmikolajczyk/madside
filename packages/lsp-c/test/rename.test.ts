import { describe, expect, it } from 'vitest'
import { prepareRenameAt, renameAt } from '../src/engine'

describe('renameAt / prepareRenameAt', () => {
  const lib = { path: 'lib.c', text: 'int counter;\nvoid bump(void) { counter++; }' }
  const main = { path: 'main.c', text: 'extern int counter;\nint get(void){return counter;}' }

  it('produces edits for every reference across files', () => {
    const offset = lib.text.indexOf('counter')
    const edits = renameAt([lib, main], lib.text, offset, 'total')
    expect(edits).toHaveLength(4)
    expect(edits.every((e) => e.newText === 'total')).toBe(true)
    // each edit targets the exact span of the old name
    for (const e of edits) {
      const text = e.uri === 'lib.c' ? lib.text : main.text
      expect(text.slice(e.start, e.end)).toBe('counter')
    }
    expect(edits.filter((e) => e.uri === 'lib.c')).toHaveLength(2)
    expect(edits.filter((e) => e.uri === 'main.c')).toHaveLength(2)
  })

  it('returns no edits when the cursor is not on an identifier', () => {
    const offset = lib.text.indexOf('{')
    expect(renameAt([lib], lib.text, offset, 'x')).toEqual([])
  })

  it('prepareRenameAt reports the identifier span', () => {
    const offset = lib.text.indexOf('counter') + 2
    expect(prepareRenameAt(lib.text, offset)).toEqual({
      start: lib.text.indexOf('counter'),
      end: lib.text.indexOf('counter') + 'counter'.length,
    })
  })

  it('prepareRenameAt returns null off an identifier', () => {
    expect(prepareRenameAt(lib.text, lib.text.indexOf('{'))).toBeNull()
  })
})
