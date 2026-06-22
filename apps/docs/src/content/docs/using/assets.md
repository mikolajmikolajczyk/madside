---
title: Asset pipeline
description: Converters and recipes that turn binary assets into source.
sidebar:
  order: 7
---

The asset pipeline turns binary assets — images, CSV tables, raw data — into assembler source that your program can `icl`. A **converter** does the transformation; a **recipe** records that an input file should be run through a converter to produce an output file, and recipes run automatically as part of the build.

## The Asset panel

Open a recognised asset file (for example `.png`, `.jpg`, `.gif`, `.bmp`, `.csv`, `.bin`, `.raw`, `.tmx`, `.wav`) from the **Files** panel and madside shows the **Asset panel** instead of the text editor. It has two halves:

- a **preview** — image files render as an image, CSV as a table, anything else as a hex dump; and
- a **form** to attach a converter.

In the form you pick a converter applicable to the file's extension, fill in its options, set the output path (defaulting to `generated/<name>.asm`), and press **Add recipe**. The recipe is written into `project.json` and the project re-assembles. If a recipe already exists for the file you can **Update recipe** or **Remove recipe**.

If no converter applies to the file's extension, the form says so.

## Converters

Converters are JavaScript modules. Two ship built-in:

| Converter id | Input | What it emits |
|--------------|-------|---------------|
| `bin-to-incbin` | `.bin`, `.raw` | raw bytes as `.byte` lines (options: `label`, `perLine`) |
| `csv-to-data` | `.csv` | CSV cells as byte/word data (options: `label`, `size`) |

Image and tilemap files (`.png`, `.tmx`, …) still **preview** in the Asset panel,
but there's no built-in image-data converter yet — you supply one as a project-local
converter. Drop `.js` files under `converters/` in your project and they're picked up
automatically and offered in the Asset panel alongside the built-ins (see
[Converters](/docs/extending/converter/) for the module contract).

## How recipes run

Recipes are stored in the manifest as `recipes`:

```json
{
  "recipes": [
    {
      "input": "assets/sprite.bin",
      "output": "generated/sprite.asm",
      "converter": "bin-to-incbin",
      "options": { "label": "sprite", "perLine": 16 }
    }
  ]
}
```

During a build the recipes run before the assembler, and the pipeline fingerprints each input — recipes whose input bytes and options haven't changed are skipped, so rebuilds stay fast. The generated output files then take part in the normal [assemble](/docs/using/building/) like any other source.
