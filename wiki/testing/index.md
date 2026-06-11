# wiki/testing

Strategy, harnesses, and conventions for testing madside.

| File | What |
|------|------|
| [e2e-guardrails.md](e2e-guardrails.md) | Selectors, determinism, URL state — apply continuously so Playwright lands cleanly when scheduled (7659319) |

Full strategy: [ADR-0005](../adr/0005-testing-strategy.md). This folder is for ongoing operational rules.

## Stack in place

- **Vitest** + **fake-indexeddb** — `npx vitest run`
- **happy-dom** — only where DOM truly needed; prefer headless workbench
- **Headless workbench** — `createWorkbench({ projectRepo: memoryRepo, ... })` exercises BuildService/RunService/DebugService/AssetPipelineService end-to-end without DOM
- **Pure logic units** — sourceMap parser, recipe engine fingerprint, hex/path utilities, plugin-loader

## Contract harnesses per plugin kind

ADR-0005 mandates `assert<Kind>Plugin(impl)` Vitest fixture suites under `@ports`. Status:

| Kind | Harness | Tracked by |
|------|---------|------------|
| MachinePlugin | drift contract test (`c7cdf06`) covers bootEquates; full harness pending | — |
| ToolchainPlugin | ⏳ pending | 6ede5d8 |
| EmulatorPlugin / DebugAdapter / PanelPlugin | future (M4 follow / M6 / M7) | — |

Built-in plugins import the harness; external plugin authors get it free.

## Playwright

Deferred. Guardrails (testids, deterministic IDs, URL-loadable state) applied continuously per `e2e-guardrails.md` so one golden-path smoke can be wired without retrofit.
