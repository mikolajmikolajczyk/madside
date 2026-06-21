// Emscripten-generated ESM glue has no .d.ts; declare the default-export shape
// the chips C64 backend expects (MODULARIZE + EXPORT_ES6, EXPORT_NAME).

declare const createC64Core: (
  moduleArg?: Record<string, unknown>,
) => Promise<unknown>;

export default createC64Core;
