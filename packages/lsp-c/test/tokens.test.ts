import { describe, expect, it } from 'vitest'
import { indexC, semanticTokens } from '../src/engine'

const SRC = `struct Point { int x; int y; };
#define MAX 10
int score;
void move(int dx, struct Point p) {
  score = dx;
  p.x = MAX;
}`

describe('semanticTokens', () => {
  const text = SRC
  const index = indexC([{ path: 'main.c', text }])
  const tokens = semanticTokens(index, text)

  const typeOf = (word: string, occurrence = 0) => {
    let from = -1
    for (let i = 0; i <= occurrence; i++) from = text.indexOf(word, from + 1)
    return tokens.find((t) => t.start === from)?.type
  }

  it('tags type names', () => {
    expect(typeOf('Point')).toBe('type')
  })

  it('tags the function name', () => {
    expect(typeOf('move')).toBe('function')
  })

  it('tags parameters', () => {
    expect(typeOf('dx')).toBe('parameter') // declaration
  })

  it('tags struct fields', () => {
    expect(typeOf('x')).toBe('field') // in struct decl `int x;`
  })

  it('tags macros', () => {
    expect(typeOf('MAX', 1)).toBe('macro') // the use site `= MAX`
  })

  it('tags globals as variables', () => {
    expect(typeOf('score', 1)).toBe('variable') // the use site `score = dx`
  })

  it('emits tokens in ascending order', () => {
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]!.start).toBeGreaterThanOrEqual(tokens[i - 1]!.start)
    }
  })
})
