import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview'
import 'dockview/dist/styles/dockview.css'
import './DockLayout.css'

// ── Dockview-driven workbench body (behind VITE_MADSIDE_DOCKVIEW) ────────────
// A rearrangeable layout for the App body: every content surface (editor, file
// tree, emulator, each debug panel, output) becomes a draggable/tabbable/
// splittable dockview panel, toggleable on/off, with the arrangement persisted.
// The toolbar (MenuBar/DebugBar/StatusBar) stays fixed chrome outside this.
//
// Surfaces are LIVE ReactNodes owned by App — they change every render as App
// state changes, so they ride a context (not dockview `params`, which serialize
// to JSON for layout persistence). A dockview panel carries only its stable id;
// `SurfaceHost` resolves the live node from context.

const LAYOUT_KEY = 'madside.dock.layout'

export type DockGroup = 'left' | 'center' | 'right' | 'right-tabs' | 'bottom'

export interface DockPanelMeta {
  id: string
  title: string
  /** Seed placement for the default layout (ignored once a saved layout exists). */
  group: DockGroup
}

const SurfacesContext = createContext<Record<string, ReactNode>>({})

function SurfaceHost(props: IDockviewPanelProps<{ id: string }>) {
  const surfaces = useContext(SurfacesContext)
  return <div className="docklayout__surface">{surfaces[props.params.id] ?? null}</div>
}

const COMPONENTS = { surface: SurfaceHost }

export function DockLayout({ surfaces, panels }: {
  surfaces: Record<string, ReactNode>
  panels: DockPanelMeta[]
}) {
  const apiRef = useRef<DockviewApi | null>(null)
  const restoredRef = useRef(false)
  const seededIdsRef = useRef<string>('')
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const syncOpen = useCallback(() => {
    const api = apiRef.current
    if (api) setOpenIds(new Set(api.panels.map((p) => p.id)))
  }, [])

  const persist = useCallback(() => {
    const api = apiRef.current
    if (api) localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
  }, [])

  const add = useCallback((api: DockviewApi, m: DockPanelMeta, position?: Parameters<DockviewApi['addPanel']>[0]['position']) => {
    api.addPanel({ id: m.id, component: 'surface', title: m.title, params: { id: m.id }, position })
  }, [])

  const seed = useCallback((api: DockviewApi) => {
    api.clear()
    const center = panels.find((p) => p.group === 'center') ?? panels[0]
    if (!center) return
    add(api, center)
    let rightAnchor: string | undefined
    for (const p of panels) {
      if (p.id === center.id) continue
      switch (p.group) {
        case 'left': add(api, p, { referencePanel: center.id, direction: 'left' }); break
        case 'right': add(api, p, { referencePanel: center.id, direction: 'right' }); rightAnchor = p.id; break
        case 'right-tabs':
          add(api, p, rightAnchor ? { referencePanel: rightAnchor, direction: 'within' } : { referencePanel: center.id, direction: 'right' })
          rightAnchor = p.id; break
        case 'bottom': add(api, p, { referencePanel: center.id, direction: 'below' }); break
        default: add(api, p)
      }
    }
    seededIdsRef.current = panels.map((p) => p.id).join(',')
  }, [panels, add])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) {
      try { event.api.fromJSON(JSON.parse(saved)); restoredRef.current = true }
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

  const toggle = useCallback((m: DockPanelMeta) => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(m.id)
    if (existing) { existing.api.close(); return }
    add(api, m)
  }, [add])

  const reset = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    localStorage.removeItem(LAYOUT_KEY)
    restoredRef.current = false
    seed(api)
  }, [seed])

  return (
    <SurfacesContext.Provider value={surfaces}>
      <div className="docklayout">
        <div className="docklayout__bar">
          <span className="docklayout__hint">drag tabs to split/dock · toggle:</span>
          {panels.map((m) => (
            <label key={m.id} className="docklayout__toggle">
              <input type="checkbox" checked={openIds.has(m.id)} onChange={() => toggle(m)} />
              {m.title}
            </label>
          ))}
          <button className="docklayout__reset" onClick={reset}>Reset layout</button>
        </div>
        <DockviewReact
          className="dockview-theme-abyss docklayout__view"
          components={COMPONENTS}
          onReady={onReady}
        />
      </div>
    </SurfacesContext.Provider>
  )
}
