import type { LogLevel, Logger } from '@ports'

export interface LogEntry {
  ts: number
  level: LogLevel
  scope?: string
  message: string
  error?: unknown
  context?: Record<string, unknown>
}

export interface BufferedLogger extends Logger {
  /** Snapshot of buffered entries oldest-first. */
  drain(): LogEntry[]
  /** Latest entries last; non-mutating. */
  peek(limit?: number): LogEntry[]
  clear(): void
}

export function createBufferedLogger(scope?: string, capacity = 1000, parentBuffer?: LogEntry[]): BufferedLogger {
  const buffer: LogEntry[] = parentBuffer ?? []

  const push = (entry: LogEntry): void => {
    buffer.push(entry)
    if (buffer.length > capacity) buffer.splice(0, buffer.length - capacity)
  }

  const log = (
    level: LogLevel,
    message: string,
    error: unknown,
    context: Record<string, unknown> | undefined,
  ): void => {
    push({ ts: Date.now(), level, scope, message, error, context })
  }

  return {
    debug: (message, context) => log('debug', message, undefined, context),
    info: (message, context) => log('info', message, undefined, context),
    warn: (message, context) => log('warn', message, undefined, context),
    error: (message, error, context) => log('error', message, error, context),

    child(childScope) {
      return createBufferedLogger(scope ? `${scope}.${childScope}` : childScope, capacity, buffer)
    },

    drain() {
      const out = [...buffer]
      buffer.length = 0
      return out
    },
    peek(limit) {
      return limit && limit > 0 ? buffer.slice(-limit) : [...buffer]
    },
    clear() {
      buffer.length = 0
    },
  }
}
