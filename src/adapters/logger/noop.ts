import type { Logger } from '@ports'

const noopLogger: Logger = {
  debug() {
    /* noop */
  },
  info() {
    /* noop */
  },
  warn() {
    /* noop */
  },
  error() {
    /* noop */
  },
  child() {
    return noopLogger
  },
}

export function createNoopLogger(): Logger {
  return noopLogger
}
