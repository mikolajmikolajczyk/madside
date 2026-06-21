// Only the (light) plugin object is re-exported. The chips wasm core lives
// behind the plugin's lazy createBackend, so importing this barrel never pulls
// the core into the eager bundle — it stays a separate code-split chunk.
export { chipsZxEmulator } from './plugin'
