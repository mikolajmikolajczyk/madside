## [0.27.5] - 2026-07-01

### 🚀 Features

- *(courses)* Shareable ?course= deep link + robust fetch

### 📚 Documentation

- *(panel)* Output slot is the row below the editor, not above
## [0.27.4] - 2026-07-01

### 🚀 Features

- *(courses)* Per-course dock layout, applied on lesson open
## [0.27.3] - 2026-06-30

### 🚀 Features

- *(run)* Build on project open; Run clickable immediately
## [0.27.2] - 2026-06-30

### 🐛 Bug Fixes

- *(run)* Cold Run rebuilds current source, never runs a stale binary
## [0.27.1] - 2026-06-30

### 🐛 Bug Fixes

- *(courses)* Add Genesis + ZX128 to Course Author machines
## [0.27.0] - 2026-06-30

### 🚀 Features

- *(courses)* Optional chapters to group lessons
- *(courses)* Load courses from private repos via authed GitHub API
- *(courses)* One course identity, edit-in-place, write-aware actions (#168)
- *(courses)* Unify on courses/<slug>/ repos + drop bundled (#168)

### 🐛 Bug Fixes

- *(courses)* Tolerate the main/master mixup when loading a course
- *(courses)* Tolerate a stale jsDelivr listing after a fresh push
## [0.26.1] - 2026-06-29

### 📚 Documentation

- *(github)* Align with the per-project repo model
## [0.26.0] - 2026-06-29

### 🚀 Features

- *(github)* Per-project repos, unified import hub, drop global default repo
## [0.25.0] - 2026-06-29

### 🚀 Features

- *(github)* Separate courses repo for authoring/publishing
## [0.24.0] - 2026-06-29

### 🚀 Features

- *(github)* Per-project repo binding — import from another repo
## [0.23.0] - 2026-06-29

### 🚀 Features

- *(github)* Help "?" link to the GitHub-sync docs next to sign-in

### 📚 Documentation

- Close feature-coverage gaps vs the actual build
- *(third-party)* Complete the bundled-library listing
## [0.22.0] - 2026-06-28

### 🚀 Features

- *(github)* Auto-sync projects across devices (#166)
- *(github)* Status-bar sync indicator + opt-in auto-sync controls

### 📚 Documentation

- Document GitHub sync (connect, save, auto-sync, conflicts)

### ⚙️ Miscellaneous Tasks

- *(pages)* Inject VITE_GH_APP_SLUG so the install link works in prod
## [0.21.0] - 2026-06-28

### 🚀 Features

- *(ide)* Build-time GitHub persistence capability gate (#158)
- *(ide)* GitHub sign-in + dedicated-repo selection (#159)
- *(courses)* Multi-course repos via courses/<slug>/ + backward-compat (#164)
- *(github)* Push projects to the user's repo via Git Trees (#160)
- *(github)* Pull + browse + import projects from the repo (#161)
- *(github)* Sharing, history, remove, commit messages (#162)
- *(courses)* Publish a course to the repo under courses/<slug>/ (#165)
- *(github)* Settings.json theme sync + browse/edit courses in repo
- *(github)* Amend-by-default saves + live refresh; fix stale-read 422s
- *(ide)* Toolbar snapshot/history + GitHub push/pull, Ctrl+Shift+S to save to GitHub

### 🐛 Bug Fixes

- *(github)* Production hardening of the sync layer
- *(github)* Reliable atomic remove/push via full-tree rebuild

### ⚙️ Miscellaneous Tasks

- *(release)* V0.21.0
## [0.20.1] - 2026-06-27

### 🚀 Features

- *(ide)* Project-plugin inventory — discoverable transparency view (#69)

### 🐛 Bug Fixes

- *(ide)* Drop hardcoded 6502 cpu-state cast in Emulator.emit (#149)

### 🚜 Refactor

- *(asm-lsp)* Worker-per-dialect for mixed-dialect projects (#148)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.20.1
## [0.20.0] - 2026-06-27

### 🚀 Features

- *(ide)* On-screen-keyboard symbol bar for touch devices (#144)
- *(ci)* Publish site to GitHub Pages on release
- *(genesis)* VDP memory viewer — CRAM palette + VRAM tile grid (#146)
- *(genesis)* VDP sprite viewer + iPad viewport scroll fix
- *(genesis)* 2-player input, stereo audio, macro-aware source map (#146)
- *(zx-c)* Variables locals + per-line breakpoints + step-over for sccz80 (#136)

### 🐛 Bug Fixes

- *(z88dk)* Re-enable copt peephole with a circular-equate guard (#105)
- *(lsp-c)* Resolve macros/enums/exprs in array sizes + macro-sized field names
- *(lsp-c)* Resolve typedef-to-array types (typedef int Row[N])

### ⚙️ Miscellaneous Tasks

- *(release)* V0.20.0
## [0.19.0] - 2026-06-25

### 🚀 Features

- *(ide)* Welcome screen redesign — token-driven reskin + two-column layout
- *(z88dk)* Sccz80 C source-level debug — C_LINE + link map → source map (#135)
- *(genesis)* True single-instruction 68000 step (#146)
- *(genesis)* Full Z80 debugging — breakpoints, single-step, dialect, current-line (#146)

### 🐛 Bug Fixes

- *(ide)* Keep the open file across reloads + stop PC-follow yanking it back
- *(lsp-asm)* Stop flagging hex digits, strings, and option operands as undefined symbols
- *(ide)* Highlight size-suffixed m68k opcodes + data directives
- *(genesis)* Instruction-granular 68000 breakpoints (#146)
- *(genesis)* Handle BankBreakpoint objects in gpgx setBreakpoints (#146)
- *(genesis)* Trap a breakpoint on the entry point on the first run (#146)
- *(genesis)* Harden the dual-CPU debugger after audit (#146)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.19.0
## [0.18.0] - 2026-06-25

### 🚀 Features

- *(toolchain)* Capture cc65 segment bank/offset into the source map (ADR-0014 Phase 0)
- *(toolchain)* Capture MADS .lst bank prefix into the source map (ADR-0014 Phase 0)
- *(machine)* Declare 130XE bank window (BankWindow descriptor, ADR-0014 Phase 1 Step 2) (#134)
- *(ports)* BankMap() + bank-aware breakpoints contract (ADR-0014 Phase 1 Step 3) (#134)
- *(emu)* Altirra bankMap() + bank-aware breakpoints (ADR-0014 Phase 1 Step 4) (#134)
- *(debug)* Bank-aware breakpoints + current-line end-to-end (ADR-0014 Phase 1 Step 5) (#134)
- *(ui)* Live-bank indicator + gutter bank annotation (ADR-0014 Phase 1 Step 6) (#134)
- *(template)* Runnable Atari 130XE banking demo + real @BANK_ADD loader (ADR-0014 Phase 1) (#134)
- *(nes)* PRG bank-aware debugging via write-only-latch tracking (ADR-0014 Phase 2) (#134)
- *(nes)* Banked source map from cc65 — close the editor-side of NES banking (ADR-0014 Phase 2 step 5) (#134)
- *(template)* Runnable NES PRG-banking demo (UxROM) + joined live test (ADR-0014 Phase 2) (#134)
- *(zx128)* ZX Spectrum 128K machine + bank-aware debugging (ADR-0014) (#134)
- *(z88dk)* Source-level debugging for ZX from z80asm list+map (#87) (#134)
- *(z88dk)* ZX128 bank-aware source map via BANK_n section convention (ADR-0014) (#134)
- *(zx)* LoadZ80 (.z80 v2/v3 snapshot) for 128K banked loading (ADR-0014) (#134)
- *(zx128)* Runnable banked template + 128K .z80 generator + joined test (ADR-0014) (#134)
- *(lsp-asm)* Opcode-hint tables + dialect profiles foundation (#140)
- *(lsp-asm)* Line-oriented engine + LanguageProvider (def/refs/rename/hover/diag) (#140)
- *(ide)* Wire asm LSP hover + completion into the editor (#140)
- *(ide)* Asm LSP go-to-definition + find-references + rename + cross-file sync (#140)
- *(ide)* Asm LSP semantic-token coloring + inline analysis diagnostics (#140)
- *(lsp-asm)* Addressing-mode validation diagnostics (6502) (#140)
- *(lsp-asm)* M68000 / clownassembler dialect — complete the assembler set (#140)
- *(lsp-asm)* Recognize MADS pseudo-ops + illegal opcodes (custom mnemonics) (#140)
- *(genesis)* Opt-in Z80 composite build — assemble own Z80 source into the ROM (#147 Phase 1B)
- *(genesis)* Runnable Z80 sound template (#147 Phase 1 complete)
- *(genesis)* Expose the Z80 in gpgx for dual-CPU debug (#147 Phase 2a)
- *(debug)* Focused-CPU routing in DebugService — dual-CPU engine (#147 Phase 2bc)
- *(ui)* CPU switch in the registers panel for dual-CPU machines (#147 Phase 2e)
- *(genesis)* Per-CPU source map + focused-CPU current-line (#147 Phase 2d)
- *(genesis)* Z80 line breakpoints that trap — Phase 2 complete (#147 Phase 2d-2)
- *(genesis)* Z80 $6000 bank window — Phase 3, #147 complete

### 🐛 Bug Fixes

- *(z88dk)* Map zx128 machine to the +zx target (banked build was rejected) (#134)
- *(z88dk)* Read banked section binaries from the source dir, not root (#134)
- *(zx)* Chips backend setBreakpoints must extract BankBreakpoint addr (#134)
- *(export)* Name the exported binary by detecting its bytes, not the machine default (#138)
- *(audio)* IOS-safe AudioContext — gesture unlock, native rate, worklet resampling

### 🚜 Refactor

- *(nes)* Derive PRG bank windows from the loaded mapper, not a static declaration (ADR-0014 Phase 2) (#134)
- *(lsp)* Rename cc65* C-LSP client surface to c* (serves both cc65 + z80)
- *(core)* Slim @core/cpu to the bare opcode set, hints move to the LSP (#140)

### 📚 Documentation

- *(adr)* ADR-0014 bank-aware addressing + design gathering (#134, #88)
- *(banking)* Phase 1 execution plan — Atari 130XE (ADR-0014, #134)
- *(banking)* Phase 1 Step 1 verified — OPT B+ .lst/.lab shape + readMem($D301) (#134)
- *(template)* Drop internal ADR ref from 130xe-bank template comments
- *(third-party)* Drop internal phase/issue refs from public lib descriptions
- *(banking)* Record jsnes mapper coverage audit — all 20 use the wrapped PRG primitives (#134)
- *(banking)* Document the bank-aware extension boundary (ADR-0014 + plugin-author docs)
- *(banking)* ZX128 runtime done + editor-side findings (z88dk has no source map yet, #87) (#134)
- *(banking)* ZX editor-side source map done (#87 + BANK_n convention) (#134)
- Refresh wiki + user docs for asm LSP, Genesis Z80, iOS audio

### 🧪 Testing

- *(banking)* Atari 130XE bank-aware debug integration + extract bank-match (ADR-0014 Phase 1 Step 7) (#134)
- *(banking)* Live Altirra-core proof that bankMap() tracks PORTB (ADR-0014 Phase 1) (#134)
- *(banking)* Full live BP-trap proof on real Altirra 130XE core (ADR-0014 Phase 1) (#134)
- *(genesis)* De-risk the pre-built Z80 driver incbin path on the real toolchain (#147)
- *(genesis)* Assert the Z80 sound template drives non-silent PSG audio (#147)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.18.0
## [0.17.0] - 2026-06-24

### 🚀 Features

- *(plugins)* Consent gate + content-hash trust for project-local plugins (#142)
- *(toolchain)* Clownassembler ToolchainPlugin — M68k assembler (#145, Phase A)
- *(machine)* Machine-genesis — Sega Mega Drive / 68000 MachinePlugin (#145, Phase A)
- *(emulator)* Genesis-musashi EmulatorPlugin + RunBackend (#145, Phase A)
- *(debug)* M68k DebugAdapter — completes Genesis Phase A (#145)
- *(emulator)* Genesis-gpgx EmulatorPlugin + RunBackend (#145, Phase B)
- *(toolchain)* Clownassembler line<->address source map (#145)
- *(template)* Sega Genesis hello-world (clownassembler) (#145)

### 🐛 Bug Fixes

- *(docker)* Correct build paths for the apps/ monorepo (#89)
- *(workbench)* Wire genesis into machine selection + media (#145)

### 💼 Other

- *(toolchain)* Clownassembler.wasm — M68k/Genesis assembler (#145, Phase A)
- *(emulator)* Musashi.wasm — 68000 core for Genesis (#145, Phase A)
- *(genesis)* Gpgx full-system core -> wasm32 reactor (#145, Phase B)

### 🚜 Refactor

- *(debug)* Make the address seam width/space-aware (#133, 88A)

### 📚 Documentation

- *(status)* Record the Genesis/68000 backend (Phase A) + full contract-harness coverage
- *(genesis)* Pin gpgx + Phase B build plan (#145)
- *(genesis)* Record gpgx Phase B (build doc, status, license table)
- *(public)* Add the Sega Genesis machine across the docs site
- *(agents)* Bring the wiki current with the Genesis backend

### 🧪 Testing

- *(contracts)* Cover the newer plugins (zx machine, variables panel, z80 adapter)
- *(integration)* End-to-end Genesis 68000 chain (#145, Phase A capstone)

### ⚙️ Miscellaneous Tasks

- *(tsconfig)* Add the Genesis packages to the plugins project
- *(genesis)* Remove the redundant bare-Musashi backend
- *(release)* V0.17.0
## [0.16.0] - 2026-06-23

### 🚀 Features

- *(editor)* Opt-in cc65-intel LSP for C completion (#63)
- *(editor)* Cc65-intel LSP parity — stdlib completion, hover, auto-include (#63)
- *(editor)* Multi-document C LSP client — open all project .c/.h (#70)
- *(editor)* C go-to-definition via LSP (#73)
- *(editor)* Read-only CodeMirror sysroot header viewer (#78)
- *(editor)* C semantic-token highlighting via LSP (#72)
- *(editor)* C signature help via LSP (#71)
- *(editor)* C semantic diagnostics via LSP (#77)
- *(cpu)* Z80 instruction vocabulary (#80)
- *(toolchain)* Z88dk z80asm + appmake → wasm (#83)
- *(machine)* ZX Spectrum 48K MachinePlugin (#81)
- *(emulator)* Chips ZX Spectrum 48K core (#82)
- *(toolchain)* Z88dk asm-first toolchain plugin (#84)
- *(template)* Zx-asm-hello — ZX Spectrum Z80 asm starter (#86)
- *(debug)* Z80 debug adapter + ZX machine selection (#85)
- *(ui)* C outline in the sidebar via LSP (#76)
- *(editor)* C find-references via LSP (#74)
- *(editor)* C rename symbol via LSP (#75)
- *(editor)* Pass cc65 target defines to the C LSP (#30 host side)
- *(toolchain)* Z88dk C path for ZX Spectrum (#87)
- *(toolchain)* Z88dk C printf/stdio on ZX Spectrum (#87)
- *(toolchain)* Real copt peephole optimiser for the z88dk C path (#87)
- *(lsp)* Scaffold @madside/lsp-core — language-agnostic LSP framework (#111)
- *(lsp)* @madside/lsp-c — generic C engine over the LanguageProvider contract (#112)
- *(lsp)* @madside/lsp-cc65 + migrate the IDE off @cc65-intel/* (#113)
- *(lsp)* @madside/lsp-z80 — sccz80/z88dk C language server for ZX Spectrum (#114)
- *(lsp)* Close the __ZPROTO gap — index z88dk macro-defined functions (#114)
- *(vfs)* Surface the z88dk +zx sysroot read-only in the file tree (#55)
- *(panel-memory)* Fill panel height with rows + wheel-scroll through memory (#119)
- *(dock)* Outline + References as their own dock panels (#120)
- *(panel-memory)* Touch-drag scrolling on the memory view (#119)
- *(theme)* Themes as plugins — ThemePlugin contract + Dark/Light + picker (#118)
- *(panel-variables)* Variables panel — flat globals + live values (#121 phase 1)
- *(lsp-c)* Type-introspection API for debug info (#129)
- *(panel-variables)* Typed globals + live values via DebugInfo (#130 step 1)
- *(panel-variables)* Expandable struct/array/pointer tree (#130 step 2)
- *(panel-variables)* Watch expressions (#132)
- *(ports)* DebugFrame/DebugScope/DebugLocal frame contract (#131)
- *(lsp-c)* FunctionLocals introspection (#131)
- *(toolchain-ca65)* Parse .dbg scope/csym frames (#131)
- *(course-author)* In-app course authoring — phase 1 (metadata form) (#139)
- *(course-author)* Lesson CRUD + reorder + markdown editing — phase 2 (#139)
- *(course-author)* Live learner preview via shared CourseView (#139)
- *(course-author)* Per-lesson check builder + clickable lesson rows — phase 3 (#139)
- *(course-author)* Course export + import (round-trip) — phase 5 (#139)
- *(course-author)* Run checks in preview + buildable lesson seeds (#139 3b)
- *(course-author)* Draft course bundle in the courses store (#139 rework step 1)
- *(course-author)* Rework authoring onto the course-bundle model (#139)

### 🐛 Bug Fixes

- *(editor)* C LSP client — error-tolerant + readable hover
- *(ui)* Drop dead eslint-disable in useEmuStateReset (#65)
- *(template)* Zx-asm-hello clears the screen on entry (#86)
- *(toolchain)* Surface C build diagnostics + fix .sna org for the z88dk C path
- *(toolchain)* Revert z88dk copt to passthrough — it drops sccz80 labels (#105)
- *(lsp)* Push sysroot/defines to a live connection so ZX completion works (#114)
- *(lsp)* Resolve z88dk header collisions + content-key the sysroot cache (#114)
- *(lsp)* ZX completion offers the right header + parses varargs decls (#114)
- *(ui)* Restore debug-panel styles lost with Debug.css removal
- *(theme)* Route remaining hardcoded UI colours through tokens (#118)
- *(dock)* Course lesson panel as its own dock surface (#127)
- *(lsp-c)* Index pointer-returning functions (#137)
- *(lsp-c)* FunctionLocals finds pointer-returning functions (#131)

### 💼 Other

- *(z88dk)* Save C-path (#87) build inputs + dispatcher reference
- *(repo)* Real pnpm workspace, fold docs, kill nested lockfile (#91)
- *(repo)* Wasm blobs as @madside/wasm-* workspace packages (#92)
- *(repo)* @madside/core + @madside/ports workspace packages (#93)
- *(repo)* @madside/toolchain-{mads,ca65,z88dk} workspace packages (#94)
- *(repo)* @madside/* workspace packages for all plugins (#95)
- *(repo)* @madside/ide app package; root becomes workspace shell (#96)
- *(repo)* Split justfile — dev in root, wasm machinery in build/ (#97)
- *(lint)* Migrate boundaries to the v6 dependencies rule + guard @madside deep imports (#107)
- *(lint)* Enforce lsp-core ⊥ language boundary + document MIT carve-out (#115)
- *(ui)* Dockview dockable layout behind VITE_MADSIDE_DOCKVIEW (#55 follow-up)
- *(ui)* Migrate App body to a dockview layout behind the flag (#55 follow-up)
- *(ui)* Madside dockview theme + View menu for panel toggles (#55 follow-up)
- *(ui)* Floating panels, named layouts + user presets, touch tuning (#55 follow-up)

### 🚜 Refactor

- *(editor)* Cc65-intel LSP is the C engine — drop cLibrary (#63)
- *(ui)* PluginEditor imports editor contracts from @ports (#66)
- *(app)* Extract built-in plugin manifest (#67)
- *(ui)* Decompose App.tsx into workflow hooks (#65)
- *(toolchain)* Share VFS tree helpers between asm + C paths
- *(repo)* Git mv docs -> apps/docs (pure rename) (#91)
- *(repo)* Git mv wasm blobs -> packages/wasm-* (pure rename) (#92)
- *(repo)* Git mv core + ports -> packages/{core,ports}/src (pure rename) (#93)
- *(repo)* Git mv toolchain plugins -> packages/toolchain-* (pure rename) (#94)
- *(repo)* Git mv remaining plugins -> packages/* (pure rename) (#95)
- *(repo)* Git mv host layers + assets -> apps/ide (pure rename) (#96)
- *(repo)* Git mv build-support + third-party.toml -> build/ (pure rename) (#97)
- *(explorer)* Unify read-only sysroot into the file tree as a mount (#55)
- *(ui)* Make dockview the only layout — drop the flag + legacy splitter UI
- *(panels)* Co-locate panel styles in their packages, not the app
- *(services)* Extract headless engine to @madside/workbench-core (#123)
- *(storage)* Extract IDB backend to @madside/storage-idb (#125)
- *(courses)* Decouple course logic from concrete adapters + app templates

### 📚 Documentation

- *(z88dk)* C-path (#87) progress — 3 compilers built, link remaining
- *(z88dk)* #87 approach — shim system() to host, ship zcc.wasm
- *(z88dk)* #87 — zcc.wasm drives the full classic recipe via shim
- *(z88dk)* #87 — two shim blockers fixed, link reaches; WASI .. path bug next
- *(z88dk)* #87 — WASI .. path fixed, C compiles+links+BOOTS
- Update internal docs for the monorepo layout (#106)
- Remove stale CLEANUP.md backlog (superseded by GitHub issues)
- *(adr)* ADR-0009 — in-repo language-agnostic LSP packages
- Reflect the in-repo @madside/lsp-* C language server (#110)
- Drop stale 'cc65-intel' references from comments post-migration (#110)
- *(adr)* Mark ADR-0008 (virtual filesystem) Accepted
- *(adr)* ADR-0010 — Dockview as the workbench layout (Accepted)
- *(adr)* ADR-0011 — toolchain-supplied language-agnostic DebugInfo (Accepted)
- *(adr)* ADR-0012 — debug stack-frame model + cc65-ABI deferral (#131)
- *(toolchain-ca65)* Mark parseDbg frame parse as unconsumed (#131)
- *(agents)* Refresh status + architecture to current state
- *(public)* Bring the Starlight site to current — C64, ZX, Dockview, Variables
- *(public)* Second accuracy pass — fix fabrications + Step Over/Instruction, add theme plugin
- *(agents)* Correct themes-as-plugins status — shipped, not deferred
- *(public)* Name custom editors 'visual editors' to disambiguate from the code editor
- *(public)* Document the in-app Course Author editor (#139)
- *(adr)* ADR-0013 — project-local plugin trust (consent + content-hash + sandbox)

### ⚡ Performance

- *(lsp)* Cache the sysroot index so reindex is O(project), not O(sysroot) (#114)

### 🧪 Testing

- *(integration)* Cross-service build→run + machine-switch isolation (#68)
- List zx-asm-hello in templates contract (#86)
- *(toolchain)* Cover z88dk C-path routing + diagnostics

### ⚙️ Miscellaneous Tasks

- Drop unused @codemirror/search dep + ignore docs/dist in eslint
- *(dev)* Expose vite dev server over Tailscale
- Consolidate on one workspace job (build+test+lint+docs) (#99)
- *(repo)* Post-#89 config cleanup — tsconfig.node + justfile pnpm (#108)
- *(tooling)* Wire the repoctx skill into the repo
- *(release)* V0.16.0
## [0.15.1] - 2026-06-19

### 🐛 Bug Fixes

- *(c64)* Register mos6510 CPU so MADS syntax highlighting works

### ⚙️ Miscellaneous Tasks

- *(release)* V0.15.1
## [0.15.0] - 2026-06-19

### 🚀 Features

- *(c64)* Commodore 64 machine, chips emulator, cc65/MADS toolchains + templates (#53)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.15.0
## [0.14.0] - 2026-06-18

### 🚀 Features

- *(toolchain)* Cc65 custom build options — linker config, per-tool args, mixed C/asm (#51)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.14.0
## [0.13.0] - 2026-06-18

### 🚀 Features

- *(toolchain)* Cc65 source-level debugging — C breakpoints + step over (#49)

### 🐛 Bug Fixes

- *(editor)* Preserve cursor position on format (minimal diff, not full replace)
- *(templates)* 4-space indent in asm templates (match editor default)

### ⚙️ Miscellaneous Tasks

- *(release)* V0.13.0
## [0.12.0] - 2026-06-18

### 🚀 Features

- *(welcome)* Help links, template/course filters, project actions, started-courses

### 💼 Other

- *(just)* Add `just release X.Y.Z` — gates, bump, git-cliff, signed tag, gh release
- Third-party registry + build-support/ for the bundled wasm toolchains
- *(docker)* Exclude _notes/ (2GB build cache) + .repoctx from the image context

### 📚 Documentation

- Full accuracy sweep — cc65/C, VFS, build trigger, and stale-claim fixes

### ⚙️ Miscellaneous Tasks

- *(release)* V0.12.0
## [0.11.0] - 2026-06-18

### 🚀 Features

- *(nes)* Wire jsnes audio, frame parity, and controller input
- *(commands)* Command palette + route shortcuts through the registry
- *(ui)* Add ADR-0004 root + panel error boundaries
- *(infra)* Add CSP + security headers + caching to static-web-server
- *(ts)* Enable strict mode + noImplicitOverride
- *(ui)* Surface the command palette + fix the shortcut docs
- *(ui)* Replace alert() error paths with a non-blocking toast surface
- *(courses)* Show official courses on the welcome screen by default (#default-display)
- *(asset)* Editable raw view + smarter recipe buttons (#33)
- *(editor)* Inline build diagnostics on the editor lines (#29)
- *(courses)* Boot allowance for check-runner via MachinePlugin (#30)
- *(editor)* Live memory values next to address equates (#34)
- *(explorer)* Import external files into the project (#31)
- *(ui)* Directional keyboard pane focus, tiling-WM style (#27)
- *(build)* Adopt React Compiler, re-enable readiness lint rules (#28)
- *(toolchain)* Cc65 — write NES games in C, built in-browser (#1)
- *(vfs)* Core port + providers + WASI bridge (#56)
- *(toolchain)* Show the toolchain sysroot read-only in the file tree (#50)
- *(vfs)* Persistent asset cache for wasm modules + sysroots (#54)
- *(toolchain)* Cc65 multi-target — write C for Atari too (#52)
- *(editor)* Syntax highlighting for cc65 C + ca65 assembly (#47)
- *(editor)* Autocomplete + hover for cc65 C stdlib / ca65 (#48)
- *(editor)* Auto-#include the header when accepting a cc65 completion (#48)
- *(editor)* Complete the user's own C functions + macros, not just the stdlib (#48)
- *(editor)* Cross-file C completion + configurable indent, manual build, format-on-save (#58, #59)
- *(editor)* Clang-format C formatting on save + Format Document (#60)
- *(editor)* Auto-close brackets + clang-format InsertBraces (#60)
- *(emulator)* Show "Compilation error" overlay when a blocked Run is attempted
- *(storage)* Persist last build per project, restore on reload (#62)

### 🐛 Bug Fixes

- *(courses)* Reject/strip course-supplied plugin code (data-not-code)
- *(storage)* Snapshot ids use randomUUID, not a 1000-bucket RNG
- *(store)* Extract debounced file saver + fix stale-write resurrection
- *(a11y)* Make the file tree keyboard-accessible
- *(boundaries)* Invert plugin-loader injection; classify root-level layer files (#25)
- *(a11y)* Palette focus-restore + combobox roles; bump tertiary text contrast (#24, #16)
- *(errors)* Wrap course-fetch network failures in NetworkError (#12)
- *(errors)* IDB adapter throws StorageError + quarantines corrupt rows (#12)
- *(palette)* Explicitly refocus the editor on close (#24)
- *(run)* Keep audio alive when editing during a run; stop Ctrl+Enter inserting a newline
- *(errors)* Stop flattening typed errors at UI catch sites (#12)
- *(editor,build)* Refresh editor on content change; show build error location
- *(store)* Surface generated/ recipe outputs in the file tree after build (#32)
- *(ui)* Rename File → New project to Close project; actually close the project
- *(infra)* CSP must allow 'unsafe-eval' for the Altirra emulator
- *(docs)* Bump esbuild to >=0.28.1 (GHSA-gv7w-rqvm-qjhr)
- *(toolchain)* Parse cc65 C compile errors + strip ld65 ANSI (#61)

### 🚜 Refactor

- *(plugins)* Formalize EmulatorPlugin port; co-locate mads.wasm
- *(workbench)* Resolve debug adapters through the registry
- *(emulator)* Put audio on the RunBackend port
- *(types)* Shared Cpu6502State + validate manifest in the edit path
- *(storage)* Extract shared persistence semantics, kill adapter twins (#19)
- *(audio)* Extract shared AudioPushPump + worklet source (#10)
- *(cleanups)* Share debounce constant, reuse @core/hex in check-runner (#23)
- *(emu)* AltirraBackend implements RunBackend, drop EmuBackend (#16)
- *(plugins)* Plugin contracts extend PluginBase; drop list() double-casts (#23)
- *(app)* Inject StorageBackend instead of the hidden singleton (#16)
- *(zip)* Express project ZIP I/O over the StorageBackend port (#16)
- *(panels)* Place panels by a declared slot, de-special-case output (#16)
- *(plugins)* Drop dead editor-as-panel scaffolding; two lifecycles by design (#23)
- Name the PPU/emulator refresh-interval magic numbers (#23)
- *(toolchain)* Migrate MADS + cc65 runners onto the VFS bridge (#57)

### 📚 Documentation

- Fix staleness after the storage/emulator refactors
- *(emu)* Document the Altirra-adapter / jsnes-plugin layer split (#16)
- *(courses)* Warn that afterFrames includes boot; clarify branch CDN caching
- *(adr)* ADR-0008 app-wide virtual filesystem (mount layer)
- Document cc65/C, clang-format, VFS, build trigger, and build persistence

### ⚡ Performance

- *(build)* Split heavy vendors into separate chunks (manualChunks)
- *(labels)* Cache per-file label scans by content identity

### 🧪 Testing

- *(ports)* Contract harnesses for the remaining 5 plugin kinds
- Cover DebugService, snapshot GC/prune, converters+engine, plugin-loader (#22)
- Cover build:error stderr, official-courses fetch, errorMessage
- Project ZIP round-trip over the StorageBackend port (#16)

### ⚙️ Miscellaneous Tasks

- *(lint)* Make the lint gate bite — ratchet warnings + no-console guardrail (#26)
- *(lint)* Drive warnings to 0 — enforce the --max-warnings 0 gate (#26)
- *(infra)* Production/supply-chain hardening (#21)
- Fix security job — pin trivy/gitleaks actions to valid SHAs
- *(release)* V0.11.0
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
- *(changelog)* Add git-cliff config + generated CHANGELOG

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
