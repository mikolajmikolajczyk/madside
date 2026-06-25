# ADR-0009: In-repo, language-agnostic LSP packages

- **Status:** Accepted
- **Date:** 2026-06-21
- **Deciders:** Mikołaj
- **Tags:** architecture, lsp, packages, licensing, editor-intelligence

## Context

madside ships editor intelligence (completion, hover, go-to-def, references,
rename, semantic tokens, diagnostics) for C on retro toolchains. Today that comes
from a **separate public MIT repo** `cc65-intel`:

- `@cc65-intel/core` — a (largely target-agnostic, since #30) C engine: indexing,
  the complete/hover/def/refs/rename/semanticTokens/diagnose algorithms over C,
  with the preprocessor evaluated against **host-supplied defines**.
- `@cc65-intel/lsp` — the LSP server: vscode-jsonrpc plumbing, browser Web Worker
  + node stdio transports, document registry/sync, request routing.

madside consumes both from npm (flag-gated CodeMirror adapters under
`apps/ide/src/ui/codemirror/lsp/`). Two pressures now converge:

1. **z80 needs the same treatment.** The ZX/z88dk C path (#87) wants a sccz80/z80
   C LSP. Standing it up from scratch would duplicate ~80% of the cc65 machinery
   (LSP plumbing + generic C indexing); only the dialect/target specifics differ.
2. **Two-repo friction.** Every engine change is "publish `@cc65-intel/*`, then
   bump the dep in madside." The painful part (Yubikey-gated signing) is gone
   (soft-sign key, [[soft-sign-key]]), but the publish→bump dance remains.

madside also just became a real pnpm workspace (#89) that **already plans to
publish `@madside/*` packages** (Phase 2, #98/#100) with changesets + provenance.

The maintainer has stated there is **no goal to cultivate the LSP engine as a
standalone community library** with its own identity/contributors — "if someone
wants it, they'll consume the madside package." That removes the main reason to
keep it a separate repo.

## Decision drivers

- Avoid duplicating LSP plumbing + generic-C indexing across cc65 and z80.
- Eliminate the publish→bump two-repo dance for engine changes.
- Keep the engine **reusable** (someone may still `npm i` it) without owing it a
  separate repo, brand, or release pipeline.
- Do not foreclose **other languages** later (asm, BASIC, fantasy-console C-likes)
  — the language must not be hardcoded into the framework.
- Ride the one publishing system madside is already building (#98), not a second.

## Considered options

1. **Keep `cc65-intel` separate; add a second separate repo for z80.** Two (soon
   three) repos, two release pipelines, duplicated plumbing, triple bump dance.
   Rejected — most overhead, no offsetting benefit given no standalone-brand goal.
2. **Restructure `cc65-intel` into a separate multi-target MIT monorepo**
   (`@retro-lsp/{core,c,cc65,z80}`). Preserves a standalone library brand + adds
   z80 + shared core. Good *if* external reuse/contribution were a goal — it
   isn't. Still a second repo + second release pipeline. Rejected.
3. **Pull the engine into the madside monorepo as MIT packages, with a
   language-agnostic core.** One repo, one CI, one publish system; engine stays
   MIT and npm-consumable; z80 + shared core are trivial in the workspace.
   **Chosen.**

MIT packages inside an AGPL-3.0 repo are legitimate and common: each package
carries its own `LICENSE` (MIT) + SPDX `license` field; the combined madside app
is AGPL (MIT is compatible *into* AGPL); a third party can still take any LSP
package alone under MIT. See ADR-0006 (AGPL) — this is an explicit, scoped
carve-out, documented in `CONTRIBUTING.md`.

## Decision outcome

Move the LSP engine into `packages/` as four MIT packages, layered so the
framework knows **nothing** about any language:

```
@madside/lsp-core   language-AGNOSTIC framework — ZERO language knowledge
  • transports: browser Web Worker + node stdio
  • jsonrpc server, initialize, document registry/sync, request router
  • capability advertisement, publishDiagnostics push
  • defines the LanguageProvider contract that languages implement:
      index · completeAt · hoverAt · definitionAt · referencesAt ·
      renameAt · semanticTokens · signatureHelp · documentSymbols · diagnose
      + configure(profile, sysrootHeaders, defines)

  └─ @madside/lsp-c   generic C engine — implements LanguageProvider
       • preprocessor (host-supplied defines, #30), TU/header indexing, symbols
       • the complete/hover/def/refs/rename/semanticTokens/diagnose algorithms
       • parameterized by a CDialect profile (keywords, builtins, default
         defines, diagnostics mapping); sysroot headers + project defines are
         still supplied BY THE HOST at initialize (engine stays blob-free)

       ├─ @madside/lsp-cc65   cc65 (6502) dialect profile + packaged server entry
       └─ @madside/lsp-z80    sccz80/z88dk (z80) dialect profile + server entry
```

### The contract (the load-bearing rule)

**Dependencies point one way: language → core, never core → language.**
`lsp-core` must not import `lsp-c`, `lsp-cc65`, or `lsp-z80`. A language is a
package that implements `LanguageProvider`; `lsp-c` is the first implementation,
cc65/z80 are dialect profiles over it. **Adding a language (even non-C) = a new
package implementing the contract, with zero changes to `lsp-core`.** This
boundary is enforced by an ESLint rule, mirroring ADR-0002's dependency
discipline (these packages sit outside the app-layer model — they are leaf
libraries like `packages/wasm-*`).

### Host responsibilities (unchanged)

The engine never bundles sysroot headers. The host (madside) supplies, at
`initialize`: the decoded sysroot `.h` files and the active target's
preprocessor defines (`cSysroot.ts`, #30). cc65/z80 profile packages carry only
the *dialect* (keywords, builtins, default defines, diagnostics mapping), not the
actual headers — those live with the toolchain/wasm packages and are mounted at
runtime.

### Consumption

`apps/ide` CodeMirror adapters import `@madside/lsp-cc65` / `@madside/lsp-z80`
(each a ready-to-run server for its target) via `workspace:*`. The publish→bump
dance is gone; engine changes are one PR.

### Migration

`cc65-intel` source moves into `packages/lsp-*`. The split:
`@cc65-intel/lsp` → agnostic plumbing into `lsp-core`, cc65 wiring into
`lsp-cc65`; `@cc65-intel/core` → generic C into `lsp-c`, cc65 specifics into
`lsp-cc65`. `lsp-z80` is new (the #87 follow-on). `@cc65-intel/*` on npm is
deprecated in favour of `@madside/lsp-*` (madside is the only consumer).
Cross-repo git history is not preserved (subtree/manual move) — acceptable.

## Consequences

**Positive**

- One repo, one CI, one publish pipeline (rides #98) — no second release system.
- Shared core + generic C engine: z80 is a thin profile, not a re-implementation.
- Engine stays MIT + npm-consumable; no standalone-repo upkeep owed.
- Language-agnostic core leaves the door open for non-C languages with no core
  churn — the contract is the extension point.
- Engine stays pure (host supplies headers/defines), so it's testable headless
  and reusable outside madside's sysroots.

**Negative / risks**

- The LSP loses a standalone library *brand*; a would-be contributor clones all
  of madside (a *consumer* is unaffected — `npm i @madside/lsp-cc65` is identical).
  Accepted: no community-library goal.
- Mixed-license monorepo needs discipline: per-package `LICENSE` + correct
  `license` field + a `CONTRIBUTING.md` note. Adds a little Phase-2 publish work.
- Engine changes now ride madside's release cadence (changesets gives per-package
  independent versions, so this is manageable, not blocking).
- A migration, not a refactor: done as its own epic, behind the existing flag, so
  the CodeMirror adapters swap import sources in one reviewable step.

Relates to ADR-0002 (layering — these are leaf libs outside the layer model),
ADR-0006 (AGPL — scoped MIT carve-out), and #30 (host-supplied defines, the
agnosticism that makes `lsp-c` reusable). Tracking epic + migration steps live in
GitHub issues.

## Update (2026-06-25, #140) — Assembly LSP, a second language

`@madside/lsp-asm` is the second language on the agnostic core, validating the
decision: a generic line-oriented assembly engine + `createAsmProvider(dialect)`,
dropped onto `lsp-core` without touching it (same as the z80 C server did).

**Divergence from the C LSP, decided here:** asm **dialect profiles are pure DATA
in ONE package** (`lsp-asm/src/dialects/{mads,ca65,z80asm,clownassembler}.ts`,
selected by id at runtime), NOT per-dialect packages (`lsp-cc65`/`lsp-z80`). Why:
an asm dialect is data only (CPU opcode-hint table + comment/label/equate/include/
macro syntax + directive vocab + register set) with no per-dialect deps, so a
single `asm-lsp.worker` serves all four and **adding a target = adding a profile
object**. The C dialects stay separate packages because each worker statically
bundles a dialect with heavier deps. The CPU opcode-hint data (desc + flags +
addressing modes) lives in `lsp-asm/src/cpu`, so `@core/cpu` slimmed to the bare
mnemonic set (editor intelligence loads only in the language worker).
