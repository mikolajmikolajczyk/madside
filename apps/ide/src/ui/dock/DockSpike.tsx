import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
} from 'dockview'
import 'dockview/dist/styles/dockview.css'
import './DockSpike.css'
import { MANIFEST_VERSION, type PanelPlugin, type ProjectManifestV2 } from '@ports'
import { useWorkbench } from '@app'
import { PanelSlot } from '../components/PanelSlot'

// ── Dockview layout spike (#55 follow-up / UI rearrange research) ────────────
// Throwaway proof that a dockable, VS-Code/Unity-style layout can host madside's
// existing PanelPlugin registry: every panel becomes a draggable/tabbable/
// splittable dockview panel, panels toggle on/off, the layout serializes +
// resets, and the vanilla `mount()` plugin path still works. Behind
// VITE_MADSIDE_DOCKVIEW — App.tsx is untouched. NOT production wiring.

const LAYOUT_KEY = 'madside.dock.spike.layout'

// A minimal manifest so PanelSlot can build a PanelContext without a loaded
// project — the spike proves layout, not project data (cast: spike-only).
function stubManifest(machine: string): ProjectManifestV2 {
  return { version: MANIFEST_VERSION, name: 'dock-spike', main: 'main.c', machine, toolchain: 'mads' }
}

// A vanilla `mount(container)` panel — proves the non-React PanelPlugin path
// (Blob-URL sandboxed plugins) renders fine inside a dockview panel.
const vanillaTestPanel: PanelPlugin = {
  kind: 'panel',
  id: 'spike-vanilla',
  title: 'Vanilla mount()',
  Component: undefined,
  mount(container) {
    const el = document.createElement('div')
    el.style.padding = '12px'
    el.style.fontFamily = 'var(--font-mono, monospace)'
    el.textContent = 'mounted via vanilla mount(container) — no React. ✅'
    container.appendChild(el)
    return { destroy: () => el.remove() }
  },
}

// Merged panel lookup (registry + the spike's own test panel), shared with the
// dockview-rendered host component via context.
const PanelMapContext = createContext<Map<string, PanelPlugin>>(new Map())

// The single dockview component every panel routes through. `params.panelId`
// selects which PanelPlugin to host; PanelSlot owns ctx + the error boundary.
function PanelHost(props: IDockviewPanelProps<{ panelId: string }>) {
  const panels = useContext(PanelMapContext)
  const workbench = useWorkbench()
  const panel = panels.get(props.params.panelId)
  if (!panel) return <div className="dockspike__missing">unknown panel: {props.params.panelId}</div>
  return (
    <div className="dockspike__panel">
      <PanelSlot
        panel={panel}
        projectId="dock-spike"
        manifest={stubManifest(workbench.machine.id)}
        data={{}}
      />
    </div>
  )
}

function Placeholder(props: IDockviewPanelProps<{ label: string }>) {
  return <div className="dockspike__placeholder">{props.params.label}</div>
}

const COMPONENTS = { panel: PanelHost, placeholder: Placeholder }

export function DockSpike() {
  const workbench = useWorkbench()
  const apiRef = useRef<DockviewApi | null>(null)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  const registryPanels = useMemo(() => workbench.plugins.list<PanelPlugin>('panel'), [workbench])
  const allPanels = useMemo(() => [...registryPanels, vanillaTestPanel], [registryPanels])
  const panelMap = useMemo(() => new Map(allPanels.map((p) => [p.id, p])), [allPanels])

  const persist = useCallback(() => {
    const api = apiRef.current
    if (api) localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()))
  }, [])

  const syncOpen = useCallback(() => {
    const api = apiRef.current
    if (api) setOpenIds(new Set(api.panels.map((p) => p.id)))
  }, [])

  // Default IDE-ish layout: editor center, files left, the first two panels
  // tabbed bottom-right, output bottom.
  const seedDefault = useCallback((api: DockviewApi) => {
    api.clear()
    const editor = api.addPanel({ id: 'editor', component: 'placeholder', title: 'Editor', params: { label: 'Editor surface' } })
    api.addPanel({ id: 'files', component: 'placeholder', title: 'Files', params: { label: 'File tree' }, position: { referencePanel: editor, direction: 'left' } })
    const first = registryPanels[0]
    if (first) api.addPanel({ id: first.id, component: 'panel', title: first.title ?? first.id, params: { panelId: first.id }, position: { referencePanel: editor, direction: 'right' } })
    const second = registryPanels[1]
    if (second) api.addPanel({ id: second.id, component: 'panel', title: second.title ?? second.id, params: { panelId: second.id }, position: { referencePanel: first?.id ?? editor, direction: 'within' } })
    api.addPanel({ id: 'spike-vanilla', component: 'panel', title: 'Vanilla mount()', params: { panelId: 'spike-vanilla' }, position: { referencePanel: editor, direction: 'below' } })
  }, [registryPanels])

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) {
      try { event.api.fromJSON(JSON.parse(saved)) } catch { seedDefault(event.api) }
    } else {
      seedDefault(event.api)
    }
    event.api.onDidLayoutChange(() => { persist(); syncOpen() })
    syncOpen()
  }, [seedDefault, persist, syncOpen])

  const toggle = useCallback((p: PanelPlugin) => {
    const api = apiRef.current
    if (!api) return
    const existing = api.getPanel(p.id)
    if (existing) { existing.api.close(); return }
    api.addPanel({ id: p.id, component: 'panel', title: p.title ?? p.id, params: { panelId: p.id } })
  }, [])

  const reset = useCallback(() => {
    const api = apiRef.current
    if (!api) return
    localStorage.removeItem(LAYOUT_KEY)
    seedDefault(api)
  }, [seedDefault])

  return (
    <PanelMapContext.Provider value={panelMap}>
      <div className="dockspike">
        <div className="dockspike__bar">
          <span className="dockspike__title">Dockview spike</span>
          <span className="dockspike__hint">drag tabs to split/dock · toggle panels →</span>
          {allPanels.map((p) => (
            <label key={p.id} className="dockspike__toggle">
              <input type="checkbox" checked={openIds.has(p.id)} onChange={() => toggle(p)} />
              {p.title ?? p.id}
            </label>
          ))}
          <button className="dockspike__reset" onClick={reset}>Reset layout</button>
        </div>
        <DockviewReact
          className="dockview-theme-abyss dockspike__view"
          components={COMPONENTS}
          onReady={onReady}
        />
      </div>
    </PanelMapContext.Provider>
  )
}

export default DockSpike
