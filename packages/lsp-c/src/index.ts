// @madside/lsp-c — the generic C engine + a CDialect-parameterized
// LanguageProvider for @madside/lsp-core (ADR-0009). Pair a dialect profile with
// `createCProvider`, then hand the result to lsp-core's `startServer`:
//
//   import { createCProvider } from '@madside/lsp-c'
//   import { startServer } from '@madside/lsp-core'
//   const cc65: CDialect = { decorators: /\b(?:__fastcall__|__cdecl__)\b/g, … }
//   startServer(connection, createCProvider(cc65))
//
// The engine barrel is re-exported so its pure functions + data types stay
// importable for tests and advanced use.

export { createCProvider } from './provider'
export type { CDialect } from './dialect'
export * from './engine'
