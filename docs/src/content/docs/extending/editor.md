---
title: Editors
description: Custom editors for project file types, bound by file extension.
sidebar:
  order: 4
---

An **editor** plugin owns the UI for a file type — a hex editor, a bitmap editor, a custom level editor. Like [converters](/docs/extending/converter/), editors can ship **inside a project** (`editors/*.js`), loaded at runtime via Blob URL.

:::note
As of v0.7.0 the editor contract is folded into [`PanelPlugin`](/docs/extending/panel/) via a `mount(container, ctx)` + `fileExt` shape. Existing `editors/*.js` modules keep working unchanged through an `editorToPanel` bridge. This page documents the standalone `EditorModule` contract that the project-local `editors/*.js` ecosystem uses; if you're writing a new built-in panel-style editor, read the panel guide instead.
:::

## The contract

Source: `@ports/plugin-editor.ts`.

```ts
interface EditorModule {
  meta: EditorMeta
  mount: EditorMount
}

interface EditorMeta {
  id: string
  label: string
  fileExt: string[]   // extensions this editor handles, no dot, lowercase: ['png', 'spr']
}

type EditorMount = (container: HTMLElement, ctx: EditorContext) => EditorHandle

interface EditorContext {
  value: Uint8Array                       // current file bytes
  path: string                            // POSIX path, display only
  onChange: (bytes: Uint8Array) => void   // persist a new value (debouncing is your job)
  assets: { path: string; bytes: Uint8Array }[]  // read-only snapshot of other project files
}

interface EditorHandle {
  destroy(): void                                  // free timers/observers on unmount
  onValueChange?: (bytes: Uint8Array) => void      // optional: host pushes external updates;
                                                   //   if absent, the host remounts
}
```

The host gives your editor a DOM container and the current file bytes. You render into the container, call `ctx.onChange(bytes)` to persist edits, and return a handle whose `destroy()` cleans up.

## Hello-world

```js
// editors/uppercase.js — forces typed text to uppercase
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

## Binding an editor to a file type

Drop the module at `editors/uppercase.js` and bind it in `project.json` — the `editors` map keys a file extension to a module path:

```jsonc
{
  "version": 2,
  "editors": { "txt": "editors/uppercase.js" }
}
```

Opening a `.txt` file now mounts your editor instead of the default text editor. A project-local editor shadows a built-in handling the same extension.

## Error containment

Editor crashes don't take down the workbench. The host wraps mount in a three-layer trap — synchronous `try/catch`, a React error boundary, and window-level `error` / `unhandledrejection` listeners scoped to the editor lifetime. On a crash the slot shows a fallback that names the offending plugin and offers a "Reload editor" button.

## Migrating to a panel

A bridge exists if you want to surface an existing `EditorModule` as a `PanelPlugin`:

```ts
import { editorToPanel } from '@plugins/editors'
import myEditor from './my-editor'

const myPanel = editorToPanel(myEditor)
// register under kind 'panel'; fileExt comes from meta.fileExt
```

The built-in bitmap editor already routes through this. See the [panel guide](/docs/extending/panel/) for the file-editor mode of `PanelPlugin` (`fileExt` + `ctx.file`).
