import type { PanelContext, PanelPlugin, ProjectManifestV2 } from '@ports'
import { useWorkbench } from '@app'

interface Props {
  panel: PanelPlugin
  projectId: string
  manifest: ProjectManifestV2
  data: PanelContext['data']
}

/** Slot host for a single PanelPlugin. Pulls workbench services from context,
 *  closes them with the caller's project + data slot, and renders the panel's
 *  Component. Panels are agnostic to where they're placed — Debug.tsx
 *  iterates a panel list and renders one slot per panel. */
export function PanelSlot({ panel, projectId, manifest, data }: Props) {
  const workbench = useWorkbench()
  if (panel.supports && !panel.supports(workbench.machine)) return null
  const ctx: PanelContext = {
    events: workbench.events,
    commands: workbench.commands,
    debug: workbench.debug,
    project: { id: projectId, manifest },
    machine: workbench.machine,
    data,
  }
  const Component = panel.Component
  return <Component ctx={ctx} />
}
