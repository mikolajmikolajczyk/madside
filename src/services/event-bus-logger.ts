// Dev-mode event bus tap. Wraps a base EventBus + logs every emit to the
// console with a monotonic counter, microsecond-precision delta from the
// previous event, payload, and live subscriber count. Replay-friendly:
// copy the console output into JSONL and feed it back to drive a session.
//
// Off by default. Toggled via Vite env `VITE_MADSIDE_EVENT_LOG=1`. When
// off the wrapper is never installed — zero runtime cost (createWorkbench
// just returns the unwrapped bus).
//
// Why this exists (71ddbc8): the step-button stale-registers bug (ce0dc6f)
// and the pause-time / brokeOn miss (da6299d) both took ~30 min of grep +
// console.trace to root-cause. With a per-event timeline the missed-emit
// pattern would have been visible at the first repro.

import type { EventBus, EventName } from '@ports'

/** Internal mutable handler set lookup — the logger inspects the base's
 *  subscriber count to surface it in each log entry. EventBus is a public
 *  port so we can't introspect from outside; the base implementation
 *  optionally exposes this via a debug field, otherwise we report '?'. */
interface InspectableBus extends EventBus {
  readonly __handlersFor?: (event: EventName) => number
}

export function wrapEventBusWithLogger(base: EventBus): EventBus {
  let count = 0
  let lastTs = performance.now()
  const inspectable = base as InspectableBus

  return {
    emit(event, payload) {
      const now = performance.now()
      const delta = (now - lastTs).toFixed(3)
      lastTs = now
      count += 1
      const subs = inspectable.__handlersFor?.(event) ?? '?'
      // console.group keeps the payload collapsed by default so the log
      // stays scannable. The label format is the JSONL friendly part so a
      // copy/paste replay is one regex away.
      // eslint-disable-next-line no-console
      console.groupCollapsed(
        `[evt #${count}] ${String(event)} (+${delta}ms, subs=${String(subs)})`,
      )
      // eslint-disable-next-line no-console
      console.log(payload)
      // eslint-disable-next-line no-console
      console.groupEnd()
      base.emit(event, payload)
    },

    on(event, handler) {
      return base.on(event, handler)
    },

    once(event, handler) {
      return base.once(event, handler)
    },
  }
}
