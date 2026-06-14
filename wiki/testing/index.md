# wiki/testing

Strategy, harnesses, and conventions for testing madside.

| File | What |
|------|------|
| [e2e-guardrails.md](e2e-guardrails.md) | Selectors, determinism, URL state — apply continuously so Playwright lands cleanly when scheduled |

Full strategy: [ADR-0005](../adr/0005-testing-strategy.md). This folder is for ongoing operational rules.

## Stack in place

- **Vitest** + **fake-indexeddb** — `npx vitest run`
- **happy-dom** — only where DOM truly needed; prefer headless workbench
- **Headless workbench** — `createWorkbench({ projectRepo: memoryRepo, ... })` exercises BuildService/RunService/DebugService/AssetPipelineService end-to-end without DOM
- **Pure logic units** — sourceMap parser (incl. path-aware include reconstruction, `20980c5`), recipe engine fingerprint, hex/path utilities, plugin-loader, project manifest validator

## Contract harnesses per plugin kind

ADR-0005 mandates `assert<Kind>Plugin(impl)` Vitest fixture suites under `@ports`. Status:

| Kind | Harness | Tracked by |
|------|---------|------------|
| MachinePlugin | drift contract test (`c7cdf06`) covers bootEquates; full harness pending | — |
| ToolchainPlugin | ✅ `@ports/test/assertToolchainPlugin` (`51e047c`). MADS first consumer at `tests/plugins/toolchain-mads/contract.test.ts`. | — |
| ProjectManifestV2 | ✅ validator suite at `tests/contract/project-manifest.test.ts` (`443eaed`) covers v1 reject + missing-field diagnostics + optional-field round-trip. | — |
| DebugAdapterPlugin | pending (descriptor shape + step + bp + memory) | — |
| PanelPlugin | pending (Component vs mount union + fileExt + supports gate) | — |
| EmulatorPlugin | future — contract not yet defined | — |

Built-in plugins import the harness; external plugin authors get it free.

Current run: 151 tests, 0 failures (`src/**/*.test.ts` + `tests/{integration,contract,plugins}/*.test.ts`).

## Playwright

Deferred. Guardrails (testids, deterministic IDs, URL-loadable state) applied continuously per `e2e-guardrails.md` so one golden-path smoke can be wired without retrofit.
