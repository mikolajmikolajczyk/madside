// PanelPlugin contract (v0.7.0). Generic surface every workbench panel
// implements — register / memory / output / future PPU / GTIA viewers all
// fit. Built-in panels expose React components; external (Phase 11-style
// Blob-URL) panels gain a vanilla `mount(container, ctx)` route via
// FileEditorPlugin generalisation in cae0633.

import type { ComponentType } from 'react'
import type { CommandRegistry } from './command-registry'
import type { EventBus } from './event-bus'
import type { EditorAsset } from './plugin-editor'
import type { MachinePlugin } from './plugin-machine'
import type { ProjectManifestV2 } from './project-manifest'
import type { DebugService } from './services/debug-service'

/** Live data slot panels read from. App.tsx populates per render. Keys are
 *  panel-specific strings; panels destructure what they care about. The
 *  loose shape is a v0.7.0 trade-off — typed per-panel data lands when the
 *  built-in panel set stabilises. */
export type PanelData = Record<string, unknown>

/** Optional file binding — present when the panel is a file editor (Phase 11
 *  style). The workbench routes opens on matching extensions through this
 *  panel and surfaces value / onChange / assets in PanelContext.file. */
export interface PanelFile {
  value: Uint8Array
  path: string
  onChange: (bytes: Uint8Array) => void
  assets: EditorAsset[]
}

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
  /** Present only when the panel is mounted in file-editor mode. */
  file?: PanelFile
}

export type PanelComponent = ComponentType<{ ctx: PanelContext }>

/** Vanilla DOM mount path — used by sandboxed Phase 11-style plugins loaded
 *  via Blob URL + dynamic import. The host gives the panel a container
 *  element; the panel returns a destroy callback. */
export type PanelMount = (
  container: HTMLElement,
  ctx: PanelContext,
) => { destroy: () => void }

interface PanelPluginBase {
  readonly id: string
  readonly title: string
  /** Optional capability gate. When false, the workbench hides the panel for
   *  the active MachinePlugin. */
  supports?(machine: MachinePlugin): boolean
  /** File extensions (no dot, lowercase) this panel handles when mounted as
   *  a file editor. Absent ⇒ regular panel. */
  fileExt?: readonly string[]
}

/** Render path — React-component for built-in panels, vanilla mount() for
 *  sandboxed external panels. Exactly one of `Component` / `mount` is set. */
export type PanelPlugin =
  | (PanelPluginBase & { readonly Component: PanelComponent; readonly mount?: undefined })
  | (PanelPluginBase & { readonly mount: PanelMount; readonly Component?: undefined })
