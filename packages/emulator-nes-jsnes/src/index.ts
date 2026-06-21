// Only the (light) plugin object is re-exported. The jsnes core lives behind
// the plugin's lazy createBackend, so importing this barrel never pulls jsnes
// into the eager bundle — it stays a separate code-split chunk.
export { jsnesEmulator } from './plugin'
