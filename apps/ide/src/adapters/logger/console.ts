/* eslint-disable no-console -- this IS the console Logger adapter; the no-console
   guardrail exists to push the rest of the app through this port. */
import type { Logger } from '@ports'

const prefix = (scope: string | undefined) => (scope ? `[${scope}]` : '')

export function createConsoleLogger(scope?: string): Logger {
  const tag = prefix(scope)
  return {
    debug(message, context) {
      if (context) console.debug(tag, message, context)
      else console.debug(tag, message)
    },
    info(message, context) {
      if (context) console.info(tag, message, context)
      else console.info(tag, message)
    },
    warn(message, context) {
      if (context) console.warn(tag, message, context)
      else console.warn(tag, message)
    },
    error(message, error, context) {
      if (context) console.error(tag, message, error, context)
      else if (error !== undefined) console.error(tag, message, error)
      else console.error(tag, message)
    },
    child(childScope) {
      return createConsoleLogger(scope ? `${scope}.${childScope}` : childScope)
    },
  }
}
