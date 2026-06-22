import { createContext, useCallback, useContext, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type SerializedDockview,
} from 'dockview'
import 'dockview/dist/styles/dockview.css'
import './DockLayout.css'

// ── Dockview-driven workbench body ───────────────────────────────────────────
// A rearrangeable layout for the App body: every content surface (editor, file
// tree, emulator, each debug panel, output) becomes a draggable/tabbable/
// splittable dockview panel, toggleable on/off, with the arrangement persisted.
// The toolbar (MenuBar/DebugBar/StatusBar) stays fixed chrome; panel toggles,
// presets + reset live in the MenuBar's View menu, driven through `controlsRef`.
//
// Surfaces are LIVE ReactNodes owned by App — they change every render as App
// state changes, so they ride a context (not dockview `params`, which serialize
// to JSON for layout persistence). A dockview panel carries only its stable id;
// `SurfaceHost` resolves the live node from context.

const LAYOUT_KEY = 'madside.dock.layout'
const PRESETS_KEY = 'madside.dock.presets'

// The default arrangement (files | editor | emulator/memory/registers, output
// below). Seeded on first load + on Reset; sizes act as ratios so it adapts to
// the container. Surfaces absent for the active machine render empty until they
// exist (e.g. debug panels before a project loads).
const DEFAULT_LAYOUT = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['files', 'outline', 'references'], activeView: 'files', id: '15' }, size: 381 },
            { type: 'leaf', data: { views: ['editor'], activeView: 'editor', id: '13' }, size: 868 },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['emulator'], activeView: 'emulator', id: '1' }, size: 395 },
                { type: 'leaf', data: { views: ['panel:memory'], activeView: 'panel:memory', id: '4' }, size: 307 },
                { type: 'leaf', data: { views: ['panel:registers'], activeView: 'panel:registers', id: '3' }, size: 352 },
              ],
              size: 471,
            },
          ],
          size: 1054,
        },
        { type: 'leaf', data: { views: ['output'], activeView: 'output', id: '2' }, size: 183 },
      ],
      size: 1720,
    },
    width: 1720,
    height: 1237,
    orientation: 'VERTICAL',
  },
  panels: {
    files: { id: 'files', contentComponent: 'surface', params: { id: 'files' }, title: 'Files' },
    outline: { id: 'outline', contentComponent: 'surface', params: { id: 'outline' }, title: 'Outline' },
    references: { id: 'references', contentComponent: 'surface', params: { id: 'references' }, title: 'References' },
    editor: { id: 'editor', contentComponent: 'surface', params: { id: 'editor' }, title: 'Editor' },
    emulator: { id: 'emulator', contentComponent: 'surface', params: { id: 'emulator' }, title: 'Emulator' },
    output: { id: 'output', contentComponent: 'surface', params: { id: 'output' }, title: 'Output' },
    'panel:registers': { id: 'panel:registers', contentComponent: 'surface', params: { id: 'panel:registers' }, title: 'Registers' },
    'panel:memory': { id: 'panel:memory', contentComponent: 'surface', params: { id: 'panel:memory' }, title: 'Memory' },
  },
  activeGroup: '13',
} as const

// A tighter arrangement for touch: editor + files tabbed in one group, the
// emulator/memory/registers stack on the right, output below.
const TABLET_LAYOUT = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['editor', 'files', 'outline', 'references'], activeView: 'editor', id: '13' }, size: 1033 },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['emulator'], activeView: 'emulator', id: '1' }, size: 437 },
                { type: 'leaf', data: { views: ['panel:memory'], activeView: 'panel:memory', id: '4' }, size: 265 },
                { type: 'leaf', data: { views: ['panel:registers'], activeView: 'panel:registers', id: '3' }, size: 352 },
              ],
              size: 687,
            },
          ],
          size: 1054,
        },
        { type: 'leaf', data: { views: ['output'], activeView: 'output', id: '2' }, size: 183 },
      ],
      size: 1720,
    },
    width: 1720,
    height: 1237,
    orientation: 'VERTICAL',
  },
  panels: {
    editor: { id: 'editor', contentComponent: 'surface', params: { id: 'editor' }, title: 'Editor' },
    files: { id: 'files', contentComponent: 'surface', params: { id: 'files' }, title: 'Files' },
    outline: { id: 'outline', contentComponent: 'surface', params: { id: 'outline' }, title: 'Outline' },
    references: { id: 'references', contentComponent: 'surface', params: { id: 'references' }, title: 'References' },
    emulator: { id: 'emulator', contentComponent: 'surface', params: { id: 'emulator' }, title: 'Emulator' },
    'panel:memory': { id: 'panel:memory', contentComponent: 'surface', params: { id: 'panel:memory' }, title: 'Memory' },
    'panel:registers': { id: 'panel:registers', contentComponent: 'surface', params: { id: 'panel:registers' }, title: 'Registers' },
    output: { id: 'output', contentComponent: 'surface', params: { id: 'output' }, title: 'Output' },
  },
  activeGroup: '13',
} as const

// Built-in named layouts shipped in code (vs user presets in localStorage).
// `Desktop` is the default seeded on first load + Reset.
const BUILTIN_LAYOUTS: Record<string, unknown> = {
  Desktop: DEFAULT_LAYOUT,
  Tablet: TABLET_LAYOUT,
}
// eslint-disable-next-line react-refresh/only-export-components -- a const list of built-in layout names alongside the component; splitting to its own file gains nothing
export const builtinLayoutNames: string[] = Object.keys(BUILTIN_LAYOUTS)

export interface DockPanelMeta {
  id: string
  title: string
}

/** Imperative handle for the MenuBar View menu. */
export interface DockControls {
  toggle: (id: string) => void
  reset: () => void
  /** Apply a built-in named layout. */
  applyBuiltin: (name: string) => void
  /** Pop a panel out into a floating group. */
  float: (id: string) => void
  /** Bring a panel's tab to the front (if it's open). */
  focusPanel: (id: string) => void
  /** Capture the current arrangement as a named user preset. */
  saveCurrentAs: (name: string) => void
  /** Restore a saved user preset by name. */
  applyUserPreset: (name: string) => void
  /** Delete a saved user preset. */
  deletePreset: (name: string) => void
  /** The current arrangement as JSON (for copy-to-clipboard / handoff). */
  exportLayout: () => string
}

// User-saved layouts: name → serialized dockview JSON string.
function loadPresets(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '{}') as Record<string, string> }
  catch { return {} }
}
function storePresets(p: Record<string, string>): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(p))
}

const SurfacesContext = createContext<Record<string, ReactNode>>({})

function SurfaceHost(props: IDockviewPanelProps<{ id: string }>) {
  const surfaces = useContext(SurfacesContext)
  // Nudge size-sensitive content (CodeMirror especially) to re-measure when the
  // panel is resized or revealed — dockview keeps hidden tabs mounted at stale
  // geometry, so a panel shown after a drag/tab-switch would otherwise render
  // mis-laid-out until the next window resize. A coalesced window 'resize' is
  // the lib-agnostic nudge (CM, canvas, etc. all honour it).
  const api = props.api
  useEffect(() => {
    let raf = 0
    const nudge = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    }
    const d1 = api.onDidDimensionsChange(nudge)
    const d2 = api.onDidVisibilityChange(nudge)
    return () => { d1.dispose(); d2.dispose(); cancelAnimationFrame(raf) }
  }, [api])
  return <div className="docklayout__surface">{surfaces[props.params.id] ?? null}</div>
}

const COMPONENTS = { surface: SurfaceHost }

export function DockLayout({ surfaces, panels, controlsRef, onOpenChange, onPresetsChange }: {
  surfaces: Record<string, ReactNode>
  panels: DockPanelMeta[]
  controlsRef?: MutableRefObject<DockControls | null>
  onOpenChange?: (ids: string[]) => void
  onPresetsChange?: (names: string[]) => void
}) {
  const apiRef = useRef<DockviewApi | null>(null)
  const restoredRef = useRef(false)
  const seededIdsRef = useRef<string>('')
  // Latest panel meta, read by the imperative toggle without re-binding it.
  const panelsRef = useRef(panels)
  useEffect(() => { panelsRef.current = panels }, [panels])

  const syncOpen = useCallback(() => {
    const api = apiRef.current
    if (api) onOpenChange?.(api.panels.map((p) => p.id))
  }, [onOpenChange])

  const persist = useCallback(() => {
    const api = apiRef.current
    if (api) localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
  }, [])

  const seed = useCallback((api: DockviewApi) => {
    try {
      api.fromJSON(JSON.parse(JSON.stringify(DEFAULT_LAYOUT)) as SerializedDockview)
    } catch {
      // Fallback if the default ever drifts from a valid serialization.
      api.clear()
      api.addPanel({ id: 'editor', component: 'surface', title: 'Editor', params: { id: 'editor' } })
    }
    seededIdsRef.current = panelsRef.current.map((p) => p.id).join(',')
  }, [])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) {
      try { event.api.fromJSON(JSON.parse(saved) as SerializedDockview); restoredRef.current = true }
      catch { seed(event.api) }
    } else {
      seed(event.api)
    }
    event.api.onDidLayoutChange(() => { persist(); syncOpen() })
    syncOpen()
  }, [seed, persist, syncOpen])

  // Surfaces can appear after first render (e.g. debug panels once a project
  // loads). If the layout was seeded (not restored from a saved one) and the
  // panel set changed, re-seed so new surfaces show. A restored user layout is
  // left alone — missing surfaces render empty, new ones are toggled on.
  useEffect(() => {
    const api = apiRef.current
    if (!api || restoredRef.current) return
    const ids = panels.map((p) => p.id).join(',')
    if (ids !== seededIdsRef.current) seed(api)
  }, [panels, seed])

  const toggle = useCallback((id: string) => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(id)
    if (existing) { existing.api.close(); return }
    const m = panelsRef.current.find((p) => p.id === id)
    if (m) api.addPanel({ id: m.id, component: 'surface', title: m.title, params: { id: m.id } })
  }, [])

  const reset = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    localStorage.removeItem(LAYOUT_KEY)
    restoredRef.current = false
    seed(api)
  }, [seed])

  const applyBuiltin = useCallback((name: string) => {
    const api = apiRef.current
    const layout = BUILTIN_LAYOUTS[name]
    if (!api || !layout) return
    try {
      api.fromJSON(JSON.parse(JSON.stringify(layout)) as SerializedDockview)
      restoredRef.current = true
      persist()
    } catch { /* ignore bad layout */ }
  }, [persist])

  const float = useCallback((id: string) => {
    const api = apiRef.current
    if (!api) return
    const panel = api.getPanel(id)
    if (panel) api.addFloatingGroup(panel, { width: 380, height: 300, x: 96, y: 96 })
  }, [])

  const focusPanel = useCallback((id: string) => {
    apiRef.current?.getPanel(id)?.api.setActive()
  }, [])

  const reportPresets = useCallback(() => {
    onPresetsChange?.(Object.keys(loadPresets()).sort())
  }, [onPresetsChange])

  const saveCurrentAs = useCallback((name: string) => {
    const api = apiRef.current
    const key = name.trim()
    if (!api || !key) return
    const presets = loadPresets()
    presets[key] = JSON.stringify(api.toJSON())
    storePresets(presets)
    reportPresets()
  }, [reportPresets])

  const applyUserPreset = useCallback((name: string) => {
    const api = apiRef.current
    if (!api) return
    const json = loadPresets()[name]
    if (!json) return
    try { api.fromJSON(JSON.parse(json) as SerializedDockview); restoredRef.current = true; persist() } catch { /* ignore bad preset */ }
  }, [persist])

  const deletePreset = useCallback((name: string) => {
    const presets = loadPresets()
    delete presets[name]
    storePresets(presets)
    reportPresets()
  }, [reportPresets])

  const exportLayout = useCallback(() => {
    const api = apiRef.current
    return api ? JSON.stringify(api.toJSON(), null, 2) : '{}'
  }, [])

  // Publish the imperative handle for the View menu.
  useEffect(() => {
    if (controlsRef) {
      controlsRef.current = { toggle, reset, applyBuiltin, float, focusPanel, saveCurrentAs, applyUserPreset, deletePreset, exportLayout }
    }
    return () => { if (controlsRef) controlsRef.current = null }
  }, [controlsRef, toggle, reset, applyBuiltin, float, focusPanel, saveCurrentAs, applyUserPreset, deletePreset, exportLayout])

  // Surface the saved-preset names to the View menu on mount.
  useEffect(() => { reportPresets() }, [reportPresets])

  return (
    <SurfacesContext.Provider value={surfaces}>
      <DockviewReact
        className="dockview-theme-madside docklayout__view"
        components={COMPONENTS}
        onReady={onReady}
      />
    </SurfacesContext.Provider>
  )
}
