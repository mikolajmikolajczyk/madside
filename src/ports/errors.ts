// Typed error hierarchy (ADR-0004). All adapters wrap external failures into
// these classes; services either throw on invariant violation or return
// Result<T, E> where E extends WorkbenchError for expected failures.
//
// Anything that escapes a layer boundary without extending WorkbenchError is
// treated as InternalError by the root React boundary.

export abstract class WorkbenchError extends Error {
  abstract readonly kind: string
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = this.constructor.name
    this.cause = cause
  }
}

export class BuildError extends WorkbenchError {
  readonly kind = 'build' as const
  readonly stderr?: string

  constructor(message: string, stderr?: string, cause?: unknown) {
    super(message, cause)
    this.stderr = stderr
  }
}

export class StorageError extends WorkbenchError {
  readonly kind = 'storage' as const
}

export class EmulatorTrapError extends WorkbenchError {
  readonly kind = 'emulator-trap' as const
  readonly pc?: number

  constructor(message: string, pc?: number, cause?: unknown) {
    super(message, cause)
    this.pc = pc
  }
}

export class PluginCrashError extends WorkbenchError {
  readonly kind = 'plugin-crash' as const
  readonly pluginId: string

  constructor(message: string, pluginId: string, cause?: unknown) {
    super(message, cause)
    this.pluginId = pluginId
  }
}

export class ConfigError extends WorkbenchError {
  readonly kind = 'config' as const
}

export class ManifestError extends WorkbenchError {
  readonly kind = 'manifest' as const
}

export class NetworkError extends WorkbenchError {
  readonly kind = 'network' as const
}

export class InternalError extends WorkbenchError {
  readonly kind = 'internal' as const
}

// Result<T, E> for expected failures at service boundaries.
// Throws stay reserved for invariant violations (programmer error).
export type Result<T, E extends WorkbenchError = WorkbenchError> =
  | { ok: true; value: T }
  | { ok: false; error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E extends WorkbenchError>(error: E): Result<never, E> => ({
  ok: false,
  error,
})
