/// <reference types="vite/client" />

// Injected by Vite's `define` (vite.config.ts) — the app version from package.json.
declare const __APP_VERSION__: string;

// Build-time GitHub persistence config (#158). Both PUBLIC, both optional — absent
// => browser-only. See app/github-config.ts.
interface ImportMetaEnv {
  readonly VITE_GH_BROKER_URL?: string;
  readonly VITE_GH_CLIENT_ID?: string;
  readonly VITE_GH_APP_SLUG?: string;
}
