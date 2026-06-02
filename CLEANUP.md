# CLEANUP — refactor + uporządkowanie backlog

Inwentaryzacja po Phase 12 M1+M2 (2026-06-02). Lista kandydatów do
porządkowania PRZED dalszą implementacją. Każdy punkt to standalone
robota — zero new features, czysty refactor.

Status: ⏳ = todo, ✅ = done, 🚫 = won't do.

---

## 🔴 Duplikacja (najpilniejsze)

### 1. `sha256Hex()` ×4 razy ✅
Identyczna implementacja w:
- `src/lib/storage/snapshots.ts`
- `src/lib/converters/registry.ts`
- `src/lib/converters/recipeEngine.ts`
- `src/lib/editors/registry.ts`

**Fix:** wyciągnąć do `src/lib/util/hash.ts`.

### 2. `basename()` ×4 razy ✅
- `src/App.tsx`
- `src/lib/sourceMap.ts`
- `src/components/project/FileTree.tsx`
- `src/components/project/Explorer.tsx`

Plus 3 inne wariacje `lastIndexOf("/")` rozsiane po kodzie.

**Fix:** `src/lib/util/path.ts` z `basename`, `dirname`, `extOf` (ostatnie dziś tylko w App.tsx).

### 3. `hex()` ×3 razy ✅ (Debug.tsx → util; AssetPanel/madsLang local shadows pozostają — różne semantyki)
- `src/components/debug/Debug.tsx`
- `src/components/asset/AssetPanel.tsx`
- `src/lib/madsLang.ts`

**Fix:** `src/lib/util/hex.ts` — `hex(n, width)` + warianty `$XXXX` / `0xXXXX`.

### 4. Plugin loader generic ✅
`converters/registry.ts` i `editors/registry.ts` mają niemal identyczny
`loadProjectModule()` — Blob URL + dynamic import + content-hash cache + meta
validation.

**Fix:** `src/lib/util/pluginLoader.ts<TModule>` generic. Specjalizacja w
registry tylko per-typ meta validation.

---

## 🟡 Debug noise (do wyczyszczenia)

### 5. 13 `console.log/error` w `src/` ✅

Wszystkie dodane podczas sesji debug — do usunięcia:
- `App.tsx` — `[App] render canRun=…`, `[App] runAssemble: …`, `[App] onRun …`, `[App] breakpoints addrs = …`
- `src/lib/emu/backends/altirra.ts` — `[altirra-backend] loadXEX called`, `loadXEX excPtr`
- (zostawić `console.warn` w `editors/registry.ts` i `converters/registry.ts` — sensowne fallback dla user-broken plugins)

### 6. C++ diagnostic counters w `bindings.cpp` ✅

W fork (`_notes/altirra/src/AltirraEmbed/bindings.cpp`):
- `mPixelsLogCounter`, `mAdvanceLogCounter`, `mReadMemLogCounter`
- `emscripten_console_log(f)` w step-flow, advanceFrame, capturePixels, readMem
- Wczesne `[altirra-embed] frameRefresh: applyOk=… running …` log

**Fix:** Zostawić tylko logi setBreakpoints (registracja BP — OK) i error
log w EnsureInitialized (init fail diagnostyka).

---

## 🟡 Strukturalne (większy zysk)

### 7. `App.tsx` 824 linie, 55 hooków ✅ — split do 539 linii

Wyciągnięte do `src/hooks/`:
- `useAutoAssemble` (99) — debounce + race-guard seq + setResult
- `usePluginEditor` (78) — editorSources + registry + activeModule + assets
- `useBreakpointAddrs` (32) — sourceMap + bpLinesByFile → addr set
- `useCursorMemory` (55) — cursorHighlight + memBase auto-follow
- `useProjectLabels` (50) — scan + .lab merge
- `useDebuggerShortcuts` (68) — keyboard handler F5/F6/F9/F10/F11 + Ctrl+B/S/R/P
- `useSplitterWidth` (15) — width + localStorage persist

Plus utility extract: `src/lib/labels.ts` (64) — `extractPreview`,
`extractDoc`, `scanFileLabels`.

`useGotoLabel` — nie wyciągnięte (mocno splecione z project + setActivePath
+ gotoTarget; inline cleaner niż prop-drilling całego project context).

### 8. `Emulator.tsx` — `keyCode` deprecated ⏳
TS warning ★ na linii 156. Migracja na `event.code` (physical key) +
`event.key` (logical). Aktualny `keyCode` mapping przeniesć z C++ na
JS-side jeśli convenient.

### 9. `bindings.cpp` 623 linie ⏳

W fork. Rozbicie:
- `init.cpp` — `EnsureInitialized` + init steps + EMBED_STEP macro
- `bp_step.cpp` — BP register/clear + step() + advanceFrame
- `audio_tap.cpp` — `EmbedAudioTap` class
- `bindings.cpp` — sama klasa AltirraCore + EMSCRIPTEN_BINDINGS

---

## 🟢 Drobnostki (cosmetic)

### 10. `@vite-ignore` + `new Function` hack w `altirra.ts` ⏳

Działa, brzydkie. Lepiej: przenieść glue.js z `public/altirra/` do
`src/lib/emu/backends/altirra/` jako import (vite-friendly resource),
albo dedicated Vite plugin. Niski priorytet — `new Function` trick
jest stable.

### 11. Magic constants ⏳
- `addr & 0xff80` w cursor memory follow → `const MEMVIEW_PAGE = 128`
- `kDisplayWidth = 336`, `kDisplayHeight = 224` w bindings — komentarz wyjaśniający
  że to NTSC XL+LLEXL output, potwierdzone z bridge rawscreen
- `kSampleRate = 63920` — komentarz „1.79 MHz / 28; ATAudio internal rate"

### 12. `extOf()` w App.tsx ⏳
Po przeniesieniu basename do `util/path.ts`, extOf razem.

### 13. `fileTemplates.ts` + `jsConverterLang.ts` w `lib/` ⏳
Luzem w root `lib/`. Mogą iść do `lib/templates/`.

### 14. `mads.ts` placeFile + readFile ⏳
Manual tree walk z `Directory.contents.set()`. Working OK, ale można
uprościć z reduce / iteracji. Nie hot path — niski priorytet.

---

## 🟢 Architektura (na potem)

### 15. `EmuBackend.frameRefresh()` ⏳
Aktualnie no-op (snapshot/Apply broken w Altirra). Albo wycofać z
interface (drop), albo zaimplementować real (M2 research item).
Decyzja po M2 disk drive done.

### 16. `src/lib/storage/` vs `store.ts` ⏳
Storage layer 7 plików (db, project, breakpoints, seed, snapshots,
types, zip) — strukturalnie OK. Ale `store.ts` (root `lib/`) duplikuje
część logic do React-side cache. Mógłby konsolidować z storage przez
`createUseProject({ db, ... })`.

### 17. Hardware config hardcoded w `EnsureInitialized()` ⏳
800XL + LLEXL + 64K + Basic=0 + ClearMode_Zero hardkodowane.
Dla M2 ATR drive UI + power-cycle wymagane wystawić Embind setters:
- `setHardwareMode(mode)`
- `setKernel(id)`
- `setMemoryMode(size)`
- `setBasic(enabled)`
- `coldReset()` (już mamy reset())

---

## Sugerowana kolejność

**Pierwsza fala — czysta wygrana (~45 min):**
- #1 (sha256), #2 (path utils), #3 (hex), #4 (plugin loader) — wyciągnięcie utils
- #5 (debug logs JS), #6 (debug logs C++) — usunięcie noise

**Druga fala — większy zysk (~1-2h):**
- #7 (App.tsx hook split)

**Reszta on-demand:** gdy ten kod jest dotknięty przy kolejnym feature.
