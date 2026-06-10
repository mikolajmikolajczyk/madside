// Logger port (ADR-0004). Adapters wrap external errors and log at warn; the
// React boundaries log at error inside componentDidCatch; services log
// invariant violations at error. `child(scope)` lets a layer or plugin tag
// its logs without passing the scope on every call.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void
  info(message: string, context?: Record<string, unknown>): void
  warn(message: string, context?: Record<string, unknown>): void
  error(message: string, error?: unknown, context?: Record<string, unknown>): void
  child(scope: string): Logger
}
