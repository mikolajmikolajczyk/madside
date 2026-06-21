import { describe, expect, it } from 'vitest'
import { indexC, signatureHelpAt } from '../src/engine'

function at(fixture: string) {
  const offset = fixture.indexOf('|')
  return { text: fixture.replace('|', ''), offset }
}

const SRC = [
  'void cputs(const char *s);',
  'int add(int a, int b);',
  'void noargs(void);',
  '',
  'void main(void) {',
  '  PLACEHOLDER',
  '}',
].join('\n')

function helpAt(call: string) {
  const { text, offset } = at(SRC.replace('PLACEHOLDER', call))
  const index = indexC([{ path: 'main.c', text }])
  return signatureHelpAt(index, text, offset)
}

describe('signatureHelpAt', () => {
  it('returns the signature + params for a call', () => {
    const help = helpAt('cputs(|')
    expect(help?.label).toBe('void cputs(const char *s)')
    expect(help?.parameters).toEqual(['const char *s'])
    expect(help?.activeParameter).toBe(0)
  })

  it('advances the active parameter past a comma', () => {
    expect(helpAt('add(1, |')?.activeParameter).toBe(1)
    expect(helpAt('add(|')?.activeParameter).toBe(0)
  })

  it('clamps the active parameter to the last one', () => {
    // extra args beyond the signature stay on the last parameter
    expect(helpAt('add(1, 2, |')?.activeParameter).toBe(1)
  })

  it('normalises a lone void parameter list to no parameters', () => {
    expect(helpAt('noargs(|')?.parameters).toEqual([])
  })

  it('is not confused by nested calls', () => {
    const help = helpAt('add(add(1, 2), |')
    expect(help?.parameters).toEqual(['int a', 'int b'])
    expect(help?.activeParameter).toBe(1)
  })

  it('returns null outside any call', () => {
    expect(helpAt('add(1, 2);|')).toBeNull()
  })

  it('returns null for an unknown callee', () => {
    expect(helpAt('mystery(|')).toBeNull()
  })
})
