# FileEditor (Phase 11)

> Source: [`src/ports/plugin-editor.ts`](../../src/ports/plugin-editor.ts). Reference impl: [`src/plugins/editors/builtins/bitmap.ts`](../../src/plugins/editors/builtins/bitmap.ts).

**As of v0.7.0 (commit `6f2dc20`), the FileEditor contract is folded into PanelPlugin via a vanilla `mount(container, ctx)` + `fileExt`.** Phase 11 modules keep working unchanged through the `editorToPanel` bridge — read the [PanelPlugin doc](panel.md) for the new shape. This page documents the legacy EditorModule for the existing `editors/*.js` ecosystem.

## Legacy contract

```ts
interface EditorModule {
  meta: { id, label, fileExt: string[] }
  mount: (container: HTMLElement, ctx: EditorContext) => EditorHandle
}

interface EditorContext {
  value: Uint8Array               // current file bytes
  path: string                    // POSIX path
  onChange: (bytes: Uint8Array) => void  // persist
  assets: { path, bytes }[]       // other project files
}

interface EditorHandle {
  destroy(): void
  onValueChange?: (bytes: Uint8Array) => void  // optional external update hook
}
```

## Hello-world

```js
// editors/uppercase.js — converts whatever text the user types to uppercase.
export default {
  meta: { id: 'uppercase', label: 'Uppercase', fileExt: ['txt'] },
  mount(container, ctx) {
    container.innerHTML = ''
    const ta = document.createElement('textarea')
    ta.value = new TextDecoder().decode(ctx.value)
    ta.style.width = '100%'
    ta.style.height = '100%'
    ta.addEventListener('input', () => {
      ta.value = ta.value.toUpperCase()
      ctx.onChange(new TextEncoder().encode(ta.value))
    })
    container.appendChild(ta)
    return { destroy() { container.innerHTML = '' } }
  },
}
```

Drop as `editors/uppercase.js` in your project; manifest `editors` map binds it:

```jsonc
{ "version": 2, "editors": { "txt": "editors/uppercase.js" }, ... }
```

## Error containment

Plugin errors (sync mount throws, async event-handler throws, rejected Promises) are contained per-editor — App stays alive, fallback names the offending plugin, "Reload editor" button retries. Three-layer trap; see commit `a6152af`.

## Migration to PanelPlugin

Bridge already exists:

```ts
import { editorToPanel } from '@plugins/editors'
import myEditor from './my-editor'

const myPanel = editorToPanel(myEditor)
// register via PluginRegistry under kind 'panel'; fileExt comes from meta.fileExt
```

Built-in `bitmap` editor already routes through this. Phase 11 modules can keep their existing shape indefinitely.
