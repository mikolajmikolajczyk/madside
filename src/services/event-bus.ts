import type {
  EventBus,
  EventName,
  EventPayload,
  Unsubscribe,
} from '@ports'

// Hand-rolled typed event bus. ~50 LOC, zero deps. Switch to mitt only if a
// concrete need appears (priority listeners, wildcard, namespacing — none
// today). See wiki/decisions/ if we ever swap.

type Handler<K extends EventName> = (payload: EventPayload<K>) => void

export function createEventBus(): EventBus {
  const handlers = new Map<EventName, Set<Handler<EventName>>>()

  const set = <K extends EventName>(event: K): Set<Handler<K>> => {
    let s = handlers.get(event) as Set<Handler<K>> | undefined
    if (!s) {
      s = new Set<Handler<K>>()
      handlers.set(event, s as unknown as Set<Handler<EventName>>)
    }
    return s
  }

  const off = <K extends EventName>(event: K, handler: Handler<K>): void => {
    const s = handlers.get(event) as Set<Handler<K>> | undefined
    if (s) {
      s.delete(handler)
      if (s.size === 0) handlers.delete(event)
    }
  }

  return {
    emit(event, payload) {
      const s = handlers.get(event)
      if (!s) return
      for (const h of [...s]) (h as Handler<typeof event>)(payload)
    },

    on(event, handler) {
      set(event).add(handler)
      return (() => off(event, handler)) as Unsubscribe
    },

    once(event, handler) {
      const wrap: Handler<typeof event> = (payload) => {
        off(event, wrap)
        handler(payload)
      }
      set(event).add(wrap)
      return (() => off(event, wrap)) as Unsubscribe
    },
  }
}
