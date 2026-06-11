// PanelPlugin contract (v0.7.0). Generic surface every workbench panel
// implements — register / memory / output / future PPU / GTIA viewers all
// fit. Built-in panels expose React components; external (Phase 11-style
// Blob-URL) panels gain a vanilla `mount(container, ctx)` route via
// FileEditorPlugin generalisation in cae0633.

import type { ComponentType } from 'react'
import type { CommandRegistry } from './command-registry'
import type { EventBus } from './event-bus'
import type { MachinePlugin } from './plugin-machine'
import type { ProjectManifestV2 } from './project-manifest'
import type { DebugService } from './services/debug-service'

/** Live data slot panels read from. App.tsx populates per render. Keys are
 *  panel-specific strings; panels destructure what they care about. The
 *  loose shape is a v0.7.0 trade-off — typed per-panel data lands when the
 *  built-in panel set stabilises. */
export type PanelData = Record<string, unknown>

export interface PanelContext {
  events: EventBus
  commands: CommandRegistry
  debug: DebugService
  project: { id: string; manifest: ProjectManifestV2 }
  machine: MachinePlugin
  /** Snapshot of UI-side state the panel consumes (cpu, memory, output,
   *  cursor highlight, …). React identity stable between renders unless
   *  contents actually change. */
  data: PanelData
}

export type PanelComponent = ComponentType<{ ctx: PanelContext }>

export interface PanelPlugin {
  readonly id: string
  readonly title: string
  /** Optional capability gate. When false, the workbench hides the panel for
   *  the active MachinePlugin. */
  supports?(machine: MachinePlugin): boolean
  /** React-based render path. v0.7.0 ships React-only built-ins; vanilla
   *  `mount(container, ctx)` for sandboxed external panels lands with
   *  cae0633 (FileEditorPlugin → PanelPlugin generalisation). */
  readonly Component: PanelComponent
}
