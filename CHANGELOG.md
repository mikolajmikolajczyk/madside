## [0.10.0] - 2026-06-15

### 🚀 Features

- Nix flake devShell — pinned toolchain (d8935a9)
- Pre-commit framework + static analysis stack (fa6ff3a)
- Eslint-plugin-boundaries enforcing ADR-0002 layers (01c77ab)
- @ports service + cross-cutting interface skeleton (5355356)
- Headless workbench + Logger port impl + vitest (be23d36, 2e6e96a)
- Module barrel discipline + import/no-internal-modules (2af2cf8)
- TypeScript project references — one tsconfig per layer (9ccb4fa)
- IdbProjectRepository implements ProjectRepository port (142de53)
- E2E-ready guardrails — testids + URL-loadable project (7659319)
- Extract BuildService + WorkbenchProvider (5889cce)
- Extract RunService — emulator lifecycle behind ports (ee46270)
- Extract DebugService + lift SourceMap to @ports (eac58f1)
- PluginRegistry unification — @ports types + @app glue (5488b85)
- EventBus integration — bp-hit + project:switched (9ab1bc2)
- AssetPipelineService — wrap recipe engine behind a service (a4a4865)
- Register 7 commands on workbench CommandRegistry (e5a70ba)
- *(v0.4.0)* MachinePlugin port + Atari-XL first plugin (a6c310d)
- *(v0.4.0)* Emulator canvas dims from workbench.machine (7353947)
- *(v0.4.0)* Machine sample rate canonical + drift warn (c2dc46b)
- *(v0.4.0)* MemoryView surfaces machine.memoryMap regions (7f0c7f4)
- *(v0.4.0)* KBCODE map lifted to MachinePlugin.input.codeToKey (33eb166)
- *(v0.4.0)* AtariXl.bootEquates canonical + drift contract test (c4f26da)
- *(v0.4.0)* Pixel format from MachinePlugin.display + RGBA fast path (4bd1338)
- *(v0.4.0)* SendKey held-key tracking + force-release on blur (c5aaf5a)
- *(v0.4.0)* Multi-format loader — XEX / ATR / CAR / CAS (3b73e5d)
- *(v0.4.0)* Hardware-config Embind setters wired through MachinePlugin (40e0373)
- *(v0.4.0)* AssetPipelineService.runAffected filters skipped (0b0a786)
- *(v0.4.0)* Migrate audio output to AudioWorklet (27fa821)
- *(v0.5.0)* ToolchainPlugin port + MADS first plugin + UI decouple
- *(v0.5.0)* Project.json v2 schema + manifest-driven toolchain dispatch (0897b06)
- *(v0.6.0)* DebugTarget port + atari-6502 DebugAdapter (e50d1b8)
- *(v0.7.0)* PanelPlugin port + registers/memory/output panels (3000c0e)
- *(v0.7.0)* Event-driven panel refresh via PanelContext (806766d)
- *(v0.7.0)* Widen PanelPlugin to host Phase 11 file editors (cae0633)
- *(v0.7.0)* Re-engage memory auto-follow on file switch + UI badge (04dd897)
- *(v0.7.5)* Run lifecycle FSM + subscribe() per ADR-0007 (16bf7fd)
- *(v0.7.5)* UseRunStatus() hook via useSyncExternalStore (d369f2a)
- *(v0.7.5)* Dev-mode event bus logger (71ddbc8)
- *(v0.7.5)* Symmetry emits — project:switched, file:changed, plugin:crashed (5ebeae7)
- *(v0.8.0)* Jsnes NES emulator backend skeleton (b41098c)
- *(v0.8.0)* Machine-nes MachinePlugin — data + registration (481d76b)
- *(v0.8.0)* Manifest-driven machine selection (1972a36)
- *(v0.8.0)* Seed NES sample project alongside sandbox (50e22d1)
- *(v0.8.0)* PPU viewer panel + named memory-space mechanism (93c218b)
- *(v0.8.5)* Bundled template format + loader + TemplateService (71acac1)
- *(v0.8.5)* Template-driven first-run — welcome picker, File→Templates, drop auto-seed (505492d, 9bb94da, c23a499)
- *(v0.8.7)* ToolchainPlugin.language contract + MADS provides it (6ba97ca)
- *(v0.8.7)* Generic assembly language builder + toolchain/CPU-driven editor (1f08b2c, e8e17b3)
- *(v0.9.0)* Manifest build options + toolchain args wiring (04bdb5a)
- *(v0.9.0)* Visual project.json editor — form + raw dual-mode (f6c22ae)
- *(v0.9.0)* Empty project template + reconcile File → New project (23e8414)
- *(v0.9.0)* Welcome picker — empty project + properties editor on top
- *(v0.9.0)* Welcome/manifest polish — centered form, machine↔toolchain filter
- *(v0.9.5)* Course format + glob loader + CourseService + sample course (3ed11be)
- *(v0.9.5)* Lesson instantiation + course lesson panel (500f11c, 30ba629)
- *(v0.9.5)* Declarative check runner (29540fd)
- *(v0.9.5)* Course entry points + Check wiring (2921c6c)
- *(v0.10.0)* Remote course source — GitHub/jsDelivr fetcher + registry + storage (5b8dde1, 7ff626b, 2e267eb)
- *(v0.10.0)* Course UI — add from GitHub, refresh, reset to starter (82795fd, d1fd68d)
- Show app version + alpha notice (welcome + Help → About)
- File → New project returns to welcome; welcome lists existing projects
- Export the assembled binary (File → Export binary)
- Welcome screen progressive disclosure
- Default to welcome screen; remember open project in URL; delete → welcome
- Make 'New empty project' a distinct CTA on the welcome screen

### 🐛 Bug Fixes

- *(v0.7.0)* Error boundary around PluginEditor mount (714938a)
- Remap debugger shortcuts off browser reload keys
- Path-aware sourceMap for same-basename files (30be0cf)
- Emit debug:step-done from Emulator step + frame ticks
- Panel refresh on pause + status bar brokeOn payload wiring
- *(v0.7.5)* Smart Play resume + Stop unload() to idle
- *(v0.7.5)* Gate Step + Frame on hasEmu (post-Stop they were no-ops)
- Frame advance bypasses current BP (Stop-at-BP no-op)
- *(docs)* Help → Documentation opens the docs dev server in dev
- *(run)* Discard a backend boot that finishes after a machine swap

### 💼 Other

- *(v1.0.0)* Docker image + static hosting for madside.mikolajczyk.org (efc75d1)

### 🚜 Refactor

- Dedupe utils + drop debug logs
- *(App)* Split into focused hooks (824 → 539 lines)
- Vite-tracked Altirra wasm import — drop new Function hack (aed286f)
- *(v0.4.0)* Media format dispatch lifted to MachinePlugin
- *(v0.5.0)* Simplify mads.ts VFS tree walk (771ce79)
- *(v0.6.0)* Drop EmuBackend.frameRefresh from the port (abbd8b3)
- Name + test the BP Map<->Record conversion (609be37)
- IDB schema migration framework (18ac6a7)
- *(v0.7.5)* App + Emulator derive run state from FSM (625ed88)
- *(v0.7.5)* DebugService.step is the canonical step path (1e38ae3)
- *(v0.8.7)* Extract 6502 opcode vocabulary to a CPU module (5ee1a42)
- *(storage)* Generalize behind a complete StorageBackend port

### 📚 Documentation

- Introduce wiki/, AGENTS.md, ADR-0001 plugin-based workbench
- Add ADR bar + dev-setup tooling guide
- Rewrite README for human-facing repo front page
- Workflow conventions + session-start hook + decision log
- ADR-0002 layering rules + dependency direction (10cf36f)
- ADR-0003 plugin host model — main vs worker per kind (8a46005)
- ADR-0004 error boundary + degradation strategy (68d8283)
- ADR-0005 testing strategy — contract + headless hybrid (138303a)
- ADR-0006 license — AGPL-3.0-or-later (23ccdfc)
- Wiki refresh through v0.5.0 + ADR cleanup
- *(v0.7.0)* Wiki/plugin-api — one md per plugin kind + hello-world (8418ac5)
- Wiki refresh through v0.7.0 + shortcuts decision log
- ADR-0007 — Service ↔ UI sync via state machines + events
- *(v0.7.5)* Service↔UI sync recipe lock-in (b0147e3)
- *(wiki)* Cancel M8 monorepo split + renumber milestones + refresh status
- *(wiki)* Swap v0.8.0 ↔ v0.9.0 — NES validation before docs
- *(wiki)* Reshape M9 — NES validates via MADS, ca65 deferred
- *(templates)* Translate sample source comments to English
- *(v0.9.0)* Astro Starlight site setup + Introduction + Getting Started (1116ee3)
- *(v0.9.0)* Clarify only converters + editors can be project-local
- *(v0.9.0)* Using the IDE section (577b28d)
- *(v0.9.0)* Extending madside section (08247e2)
- *(v0.9.0)* Reference section (7922d36)
- *(v0.9.0)* Meta section (b2da64b)
- *(wiki)* Pre-release accuracy sweep — wiki/ADRs vs code
- *(v0.9.5)* Course-authoring guide (17bd00e)
- *(v0.10.0)* Publish-on-GitHub guide + remote-courses trust model (af617d1, 2e267eb)
- GitHub-canonical README + CONTRIBUTING + issue/PR templates (15ba3ea, 8c6db67)
- Flip forge narrative to GitHub-canonical; remove Radicle skills (6e1f8aa)
- Storage generalization research (StorageBackend port proposal)

### ⚡ Performance

- *(dev)* Lazy Altirra backend + pre-bundle jsnes — faster page load

### 🧪 Testing

- *(v0.5.0)* AssertToolchainPlugin contract harness + MADS first consumer (6ede5d8)
- *(v0.7.5)* Wire contract harness + RunService coverage (c2d5614)
- *(v0.7.5)* Property fuzz — RunService FSM never desyncs (fcdc6d5)

### ⚙️ Miscellaneous Tasks

- Folder reorg + path aliases (572812b, 35577e6)
- Dep graph audit + madge circular guard (bc68621)
- ESLint baseline cleanup + hook promoted to pre-commit (ad5e6e2)
- *(v0.3.0)* Hex util, named magic mask, keyCode note (ca060fc, 631e378, 74d4754)
- *(v0.3.0)* Extract resetEmuState helper (5ef9d4a)
- Refresh altirra-core.{wasm,js} after fork TU split (cd90f9d)
- GitHub Actions — typecheck, test, lint, build + docs build (65f594a)
