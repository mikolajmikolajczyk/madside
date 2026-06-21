// Emscripten-generated ESM glue has no .d.ts; declare the default-export shape
// the chips ZX backend expects (MODULARIZE + EXPORT_ES6, EXPORT_NAME).

declare const createZxCore: (
  moduleArg?: Record<string, unknown>,
) => Promise<unknown>;

export default createZxCore;
