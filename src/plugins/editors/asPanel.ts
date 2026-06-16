// Bridge — Phase 11 EditorModule presented through the v0.7.0 PanelPlugin
// shape. Same loader path: editors/*.js modules now show up in the unified
// PluginRegistry under kind 'panel' (with fileExt set), and the workbench
// can route file opens through the standard PanelSlot mount path instead of
// the bespoke PluginEditor pipeline.

import type { EditorModule, PanelPlugin } from '@ports'

export function editorToPanel(editor: EditorModule): PanelPlugin {
  return {
    kind: 'panel',
    id: editor.meta.id,
    title: editor.meta.label,
    fileExt: editor.meta.fileExt,
    mount(container, ctx) {
      if (!ctx.file) {
        throw new Error(`editor panel '${editor.meta.id}' mounted without file context`)
      }
      const handle = editor.mount(container, {
        value: ctx.file.value,
        path: ctx.file.path,
        onChange: ctx.file.onChange,
        assets: ctx.file.assets,
      })
      return { destroy: () => handle.destroy() }
    },
  }
}
