// Typed event bus. M3 picks a concrete library (mitt / nanoevents) per
// ADR-0003; only the contract lives here. Plugins receive an EventBus via
// their context; services subscribe directly.
//
// The typed event map is open — extend by augmenting `WorkbenchEvents` in a
// declaration-merging block from any layer.

import type { BuildResult } from './services/build-service'

export interface WorkbenchEvents {
  'build:start': { projectId: string }
  'build:done': { projectId: string; result: BuildResult }
  'build:error': { projectId: string; message: string }

  'run:state': {
    status: 'idle' | 'loaded' | 'running' | 'paused' | 'crashed'
    prev: 'idle' | 'loaded' | 'running' | 'paused' | 'crashed'
  }

  'debug:bp-hit': { pc: number }
  'debug:step-done': { pc: number }

  'project:switched': { projectId: string }
  'file:changed': { path: string }

  'recipes:start': { projectId: string }
  'recipes:done': { projectId: string; updated: string[] }

  'plugin:crashed': { pluginId: string; kind: string; cause: unknown }
}

export type EventName = keyof WorkbenchEvents
export type EventPayload<K extends EventName> = WorkbenchEvents[K]

export interface EventBus {
  emit<K extends EventName>(event: K, payload: EventPayload<K>): void
  on<K extends EventName>(event: K, handler: (payload: EventPayload<K>) => void): Unsubscribe
  once<K extends EventName>(event: K, handler: (payload: EventPayload<K>) => void): Unsubscribe
}

export type Unsubscribe = () => void
