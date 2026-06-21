import type { PanelContext, PanelPlugin, ProjectManifestV2 } from '@ports'
import { PanelSlot } from '../PanelSlot'
import './Debug.css'

interface Props {
  panels: readonly PanelPlugin[]
  projectId: string
  manifest: ProjectManifestV2
  panelData: PanelContext['data']
}

/** Debug column = pure slot host. Panels come from the workbench plugin
 *  registry filtered against the active project's `manifest.panels` (or the
 *  machine's defaultPanels fallback). Adding panel-symbols / panel-antic etc.
 *  needs zero change here. */
export function Debug({ panels, projectId, manifest, panelData }: Props) {
  return (
    <div className="debug" data-focus-region="panel">
      {panels.map((panel) => (
        <PanelSlot
          key={panel.id}
          panel={panel}
          projectId={projectId}
          manifest={manifest}
          data={panelData}
        />
      ))}
    </div>
  )
}
