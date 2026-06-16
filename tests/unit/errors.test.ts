import { describe, expect, it } from 'vitest'
import { errorMessage, StorageError, NetworkError } from '@ports'

// errorMessage is the UI catch-site helper (#12): it must surface a typed
// error's message verbatim instead of String(e) flattening it to "Error: …"
// or "[object Object]".

describe('errorMessage', () => {
  it('returns a WorkbenchError message verbatim', () => {
    expect(errorMessage(new StorageError('corrupt project row: x'))).toBe('corrupt project row: x')
    expect(errorMessage(new NetworkError('jsDelivr listing failed (503)'))).toBe('jsDelivr listing failed (503)')
  })

  it('returns a plain Error message', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('stringifies non-Error values', () => {
    expect(errorMessage('just text')).toBe('just text')
    expect(errorMessage(42)).toBe('42')
    expect(errorMessage(null)).toBe('null')
  })
})
