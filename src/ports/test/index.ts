// Contract harnesses per plugin kind. ADR-0005 §Layer 3 — each plugin kind
// ships an `assert<Kind>Plugin(impl, fixture)` Vitest helper that built-in
// plugins use and external authors reuse.
export { assertToolchainPlugin, type ToolchainHarnessFixture } from './toolchain'
export { assertEmulatorPlugin, type EmulatorHarnessOptions } from './emulator'
export {
  assertExactlyOneEvent,
  assertNoEvent,
  captureEvents,
} from './state-machine'
