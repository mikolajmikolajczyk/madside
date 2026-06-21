# madside build orchestration. Run `just` for the list.
# Requires (host tooling): fpc 3.2.2+, gnumake, wasmtime, git, node/npm.
# Recommend running build-mads-wasm inside `nix-shell -p fpc gnumake wasmtime`.

set shell := ["bash", "-cu"]

# Repo paths. Build-input assets (our crt.pas shim, smoke tests, helper scripts)
# are committed under build-support/; scratch (cloned upstream sources +
# intermediate wasm) lives in _notes/ — git-ignored, a local build cache the
# `build-*` recipes recreate on demand.
mads_assets     := justfile_directory() / "build-support/mads"
build_dir       := justfile_directory() / "_notes/wasm-spike/build"
fpc_dir         := build_dir / "fpc-src"
mads_dir        := build_dir / "Mad-Assembler"
wasm_out        := justfile_directory() / "src/plugins/toolchain-mads/wasm-mads/mads.wasm"

# Pinned upstream — single source of truth in third-party.toml; bump there, then
# rebuild. The justfile reads pins via scripts/third-party.py (no duplication).
fpc_repo        := `python3 scripts/third-party.py get builddep.fpc.upstream`
fpc_commit      := `python3 scripts/third-party.py get builddep.fpc.ref`
mads_repo       := `python3 scripts/third-party.py get source.mads.upstream`
mads_commit     := `python3 scripts/third-party.py get source.mads.ref`

# Show available recipes.
default:
    @just --list

# === dev convenience ===

# Start Vite dev server.
dev:
    npm run dev

# Production build.
build:
    npm run build

# Preview production bundle.
preview:
    npm run preview

# TypeScript typecheck only.
typecheck:
    npx tsc --noEmit

# Install npm deps.
install:
    npm install

# === mads.wasm pipeline ===

# Full pipeline: clone sources, bootstrap FPC wasm cross, build mads.wasm, copy into the plugin.
build-mads-wasm: clone-sources bootstrap-fpc-wasm compile-mads install-mads-wasm verify-mads-wasm

# Clone (or update) FPC + Mad-Assembler at pinned commits into _notes/wasm-spike/build/.
clone-sources:
    mkdir -p "{{build_dir}}"
    if [ ! -d "{{fpc_dir}}/.git" ]; then \
        git clone --filter=blob:none "{{fpc_repo}}" "{{fpc_dir}}"; \
    fi
    cd "{{fpc_dir}}" && git fetch --depth=1 origin "{{fpc_commit}}" && git checkout "{{fpc_commit}}"
    if [ ! -d "{{mads_dir}}/.git" ]; then \
        git clone "{{mads_repo}}" "{{mads_dir}}"; \
    fi
    cd "{{mads_dir}}" && git fetch origin "{{mads_commit}}" && git checkout "{{mads_commit}}"

# Bootstrap the FPC wasm32-wasip1 cross-compiler. Idempotent — skip if ppcrosswasm32 already present.
bootstrap-fpc-wasm:
    if [ ! -x "{{fpc_dir}}/compiler/ppcrosswasm32" ]; then \
        cd "{{fpc_dir}}" && \
        make clean OS_TARGET=wasip1 CPU_TARGET=wasm32 BINUTILSPREFIX= PP=$(which fpc) && \
        make all   OS_TARGET=wasip1 CPU_TARGET=wasm32 BINUTILSPREFIX= PP=$(which fpc) \
            CROSSOPT="-O- -g- -CTbfexceptions -CTsaturatingfloattoint"; \
    fi

# Drop the crt shim into Mad-Assembler, compile mads.pas → mads.wasm.
compile-mads:
    cp "{{mads_assets}}/crt.pas" "{{mads_dir}}/crt.pas"
    cd "{{mads_dir}}" && "{{fpc_dir}}/compiler/ppcrosswasm32" \
        -Twasip1 -Pwasm32 -Mdelphi -vh -O3 \
        -Fu"{{fpc_dir}}/rtl/units/wasm32-wasip1" \
        -Fu"{{fpc_dir}}/packages/rtl-objpas/units/wasm32-wasip1" \
        -Fu. mads.pas

# Copy built mads.wasm next to its loader in the toolchain plugin (Vite ?url).
install-mads-wasm:
    mkdir -p "$(dirname "{{wasm_out}}")"
    cp "{{mads_dir}}/mads.wasm" "{{wasm_out}}"
    @echo "installed → {{wasm_out}}"
    @ls -lh "{{wasm_out}}"

# Smoke test: assemble smoke.a65 with the freshly built wasm, diff against native mads if available.
verify-mads-wasm:
    cp "{{mads_assets}}/smoke.a65" "{{mads_dir}}/smoke.a65"
    cd "{{mads_dir}}" && wasmtime --dir=. mads.wasm smoke.a65
    @echo "smoke.obx bytes:"
    @xxd "{{mads_dir}}/smoke.obx" | head -3

# Wipe build dir (forces full re-clone + re-bootstrap on next run).
clean-mads-build:
    rm -rf "{{build_dir}}"

# === cc65 wasm pipeline (ca65 / ld65 / cc65) ===
# Builds the cc65 toolchain to wasm32-wasip1 with wasi-sdk (clang). Self-
# contained: downloads wasi-sdk + clones cc65 into _notes/ca65-wasm-spike/build/
# (gitignored). Requires (host tooling): curl, gnumake, git, node 18+ (for the
# WASI smoke). No nix shell needed — wasi-sdk ships its own clang.

cc65_assets     := justfile_directory() / "build-support/cc65"
cc65_build_dir  := justfile_directory() / "_notes/ca65-wasm-spike/build"
wasi_sdk_dir    := cc65_build_dir / "wasi-sdk"
cc65_src_dir    := cc65_build_dir / "cc65"
cc65_out_dir    := justfile_directory() / "src/plugins/toolchain-ca65/wasm"
cc65_plugin_dir := justfile_directory() / "src/plugins/toolchain-ca65"
# cc65 targets to build a sysroot for (one zip each). Add a target here + a row
# in the plugin's CC65_TARGET / SYSROOT_URL maps to support another platform.
cc65_targets    := "nes atari c64"

# Pinned upstream — bump in third-party.toml, then rebuild + smoke + commit wasm.
cc65_repo       := `python3 scripts/third-party.py get source.cc65.upstream`
cc65_commit     := `python3 scripts/third-party.py get source.cc65.ref`
wasi_sdk_ver    := `python3 scripts/third-party.py get builddep.wasi_sdk.version`
wasi_sdk_asset  := `python3 scripts/third-party.py get builddep.wasi_sdk.asset`

# Full pipeline: fetch wasi-sdk, clone cc65, build the NES sysroot (native libs),
# build the wasm tools, install + smoke. The NES sysroot step runs FIRST and
# ends with `make clean` so the native + wasm builds don't share `wrk/` objects.
build-cc65-wasm: fetch-wasi-sdk clone-cc65 build-sysroots compile-cc65-wasm install-cc65-wasm verify-cc65-wasm

# Build each target's C runtime (<t>.lib + <t>.cfg + the shared headers) with
# NATIVE cc65, then zip it as the in-browser WASI sysroot the toolchain plugin
# mounts (one zip per target → `<t>-sysroot.zip`). Native build is fine — the
# libs are 6502 artifacts, host-independent. Runs FIRST and ends with `make
# clean` so the native + wasm builds don't share `wrk/` objects.
build-sysroots:
    cd "{{cc65_src_dir}}" && make clean >/dev/null 2>&1 || true
    cd "{{cc65_src_dir}}" && make -C src -j4
    cd "{{cc65_src_dir}}" && mkdir -p lib && make -C libsrc {{cc65_targets}} -j4
    for t in {{cc65_targets}}; do \
        out="{{cc65_plugin_dir}}/$t-sysroot.zip"; \
        rm -f "$out"; \
        python3 "{{cc65_assets}}/make-sysroot-zip.py" "{{cc65_src_dir}}" "$t" "$out"; \
    done
    @ls -lh "{{cc65_plugin_dir}}/"*-sysroot.zip
    cd "{{cc65_src_dir}}" && make clean >/dev/null 2>&1 || true

# Download + extract wasi-sdk (clang + wasi-libc sysroot). Idempotent.
fetch-wasi-sdk:
    if [ ! -x "{{wasi_sdk_dir}}/bin/clang" ]; then \
        mkdir -p "{{cc65_build_dir}}"; \
        curl -fsSL -o "{{cc65_build_dir}}/wasi-sdk.tar.gz" \
            "https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-{{wasi_sdk_ver}}/{{wasi_sdk_asset}}"; \
        tar -xzf "{{cc65_build_dir}}/wasi-sdk.tar.gz" -C "{{cc65_build_dir}}"; \
        mv "{{cc65_build_dir}}/wasi-sdk-{{wasi_sdk_ver}}.0-x86_64-linux" "{{wasi_sdk_dir}}"; \
        rm "{{cc65_build_dir}}/wasi-sdk.tar.gz"; \
    fi

# Clone (or update) cc65 at the pinned commit (shallow fetch of the exact SHA).
clone-cc65:
    if [ ! -d "{{cc65_src_dir}}/.git" ]; then \
        git -C "{{cc65_build_dir}}" init cc65 && \
        git -C "{{cc65_src_dir}}" remote add origin "{{cc65_repo}}"; \
    fi
    cd "{{cc65_src_dir}}" && git fetch --depth 1 origin "{{cc65_commit}}" && git checkout FETCH_HEAD

# Build ca65 + ld65 + cc65 to wasm via wasi-sdk clang. ar65/co65 are skipped —
# not needed in the browser (ld65 links loose .o; target libs are pre-built).
compile-cc65-wasm:
    cd "{{cc65_src_dir}}" && make -C src ca65 ld65 cc65 \
        CC="{{wasi_sdk_dir}}/bin/clang" AR="{{wasi_sdk_dir}}/bin/llvm-ar"
    @file "{{cc65_src_dir}}/bin/ca65" "{{cc65_src_dir}}/bin/ld65" "{{cc65_src_dir}}/bin/cc65"

# Copy the built tools next to the (future) ca65 ToolchainPlugin loader, where
# Vite hashes them as bundle assets (imported via ?url), same as mads.wasm.
install-cc65-wasm:
    mkdir -p "{{cc65_out_dir}}"
    cp "{{cc65_src_dir}}/bin/ca65" "{{cc65_out_dir}}/ca65.wasm"
    cp "{{cc65_src_dir}}/bin/ld65" "{{cc65_out_dir}}/ld65.wasm"
    cp "{{cc65_src_dir}}/bin/cc65" "{{cc65_out_dir}}/cc65.wasm"
    @echo "installed → {{cc65_out_dir}}"
    @ls -lh "{{cc65_out_dir}}/"*.wasm

# Smoke: assemble + link a tiny program with the freshly built wasm, check the
# output bytes. Uses node's built-in WASI via the spike's wasi-run.mjs.
verify-cc65-wasm:
    rm -rf /tmp/cc65-verify && mkdir -p /tmp/cc65-verify
    cp "{{cc65_assets}}/hello.s" "{{cc65_assets}}/none.cfg" /tmp/cc65-verify/
    WASI_DIR=/tmp/cc65-verify node --no-warnings "{{cc65_assets}}/wasi-run.mjs" "{{cc65_out_dir}}/ca65.wasm" -o /hello.o /hello.s
    WASI_DIR=/tmp/cc65-verify node --no-warnings "{{cc65_assets}}/wasi-run.mjs" "{{cc65_out_dir}}/ld65.wasm" -C /none.cfg -o /hello.bin /hello.o
    @echo "hello.bin bytes (expect a9 42 8d 00 02 60):"
    @xxd /tmp/cc65-verify/hello.bin | head -1

# Wipe the cc65 build dir (forces re-download of wasi-sdk + re-clone).
clean-cc65-build:
    rm -rf "{{cc65_build_dir}}"

# === altirra-core.wasm pipeline ===

altirra_dir         := justfile_directory() / "_notes/altirra"
altirra_build_dir   := altirra_dir / "build/wasm-embed"
altirra_out_dir     := justfile_directory() / "src/adapters/emu/wasm"
# We build Altirra from our AltirraEmbed fork (the SDL3/wasm embed patches +
# flake live there) — pinned in third-party.toml, same as the other toolchains.
altirra_repo        := `python3 scripts/third-party.py get source.altirra.repo`
altirra_branch      := `python3 scripts/third-party.py get source.altirra.branch`
altirra_commit      := `python3 scripts/third-party.py get source.altirra.ref`

# Full pipeline: clone the fork at the pinned commit, configure (if needed),
# build the wasm embed core, install to src/adapters/emu/wasm/.
# Requires the nix dev shell from the fork's flake.nix.
build-altirra-wasm: clone-altirra altirra-configure altirra-compile install-altirra-wasm

# Clone (or update) the madside AltirraEmbed fork at the pinned commit.
clone-altirra:
    if [ ! -d "{{altirra_dir}}/.git" ]; then \
        git clone --branch "{{altirra_branch}}" "{{altirra_repo}}" "{{altirra_dir}}"; \
    fi
    cd "{{altirra_dir}}" && git fetch origin "{{altirra_commit}}" && git checkout "{{altirra_commit}}"

# Configure with embed mode + wasm. Idempotent — only writes config if absent.
altirra-configure:
    if [ ! -f "{{altirra_build_dir}}/CMakeCache.txt" ]; then \
        cd "{{altirra_dir}}" && nix --experimental-features 'nix-command flakes' develop --command bash -c \
            'emcmake cmake -B build/wasm-embed -DCMAKE_BUILD_TYPE=Release -DALTIRRA_SDL3=ON -DALTIRRA_WASM=ON -DALTIRRA_EMBED=ON'; \
    fi

# Compile only the AltirraEmbed target (incremental — fast after first build).
altirra-compile:
    cd "{{altirra_dir}}" && nix --experimental-features 'nix-command flakes' develop --command bash -c \
        'cmake --build build/wasm-embed -j --target AltirraEmbed'

# Copy altirra-core.{wasm,js} into src/adapters/emu/wasm/ so Vite hashes
# them as proper bundle assets (per aed286f — no more public/ + new Function).
install-altirra-wasm:
    mkdir -p "{{altirra_out_dir}}"
    cp "{{altirra_build_dir}}/src/AltirraEmbed/altirra-core.wasm" "{{altirra_out_dir}}/altirra-core.wasm"
    cp "{{altirra_build_dir}}/src/AltirraEmbed/altirra-core.js"   "{{altirra_out_dir}}/altirra-core.js"
    @echo "installed → {{altirra_out_dir}}"
    @ls -lh "{{altirra_out_dir}}/altirra-core."*

# Wipe altirra build dir (forces full reconfigure).
clean-altirra-build:
    rm -rf "{{altirra_build_dir}}"

# === c64-core.wasm pipeline (chips systems/c64.h) ===

chips_dir       := justfile_directory() / "_notes/chips-build/chips"
chips_out_dir   := justfile_directory() / "src/plugins/emulator-c64-chips/wasm"
chips_repo      := `python3 scripts/third-party.py get source.chips.upstream`
chips_commit    := `python3 scripts/third-party.py get source.chips.ref`

# Full pipeline: clone chips at the pinned commit, compile the Embind wrapper
# (src/plugins/emulator-c64-chips/wasm/c64-core.cpp) to a wasm ES module, and
# install c64-core.{js,wasm}. Requires the wasm shell: `nix develop .#wasm`.
# The C64 ROMs are NOT built here — the GPL-3 Open ROMs are vendored under
# emulator-c64-chips/roms/ and handed to the core at init.
build-chips-wasm: clone-chips compile-chips-wasm

# Clone (or update) floooh/chips at the pinned commit.
clone-chips:
    if [ ! -d "{{chips_dir}}/.git" ]; then \
        git clone "{{chips_repo}}" "{{chips_dir}}"; \
    fi
    cd "{{chips_dir}}" && git fetch origin "{{chips_commit}}" && git checkout "{{chips_commit}}"

# Compile the Embind wrapper + chips core (single translation unit) to an ES6
# module. -Oz keeps the wasm small; MODULARIZE/EXPORT_ES6 + a URL-located .wasm
# match the Altirra loader pattern (src/adapters/emu/altirra.ts).
compile-chips-wasm:
    cd "{{justfile_directory()}}" && nix --experimental-features 'nix-command flakes' develop .#wasm --command bash -c \
        'set -e; \
         emcc -Oz -std=gnu11 -I "{{chips_dir}}" -c "{{chips_out_dir}}/c64-impl.c" -o /tmp/c64-impl.o; \
         em++ -Oz -std=c++17 -I "{{chips_dir}}" "{{chips_out_dir}}/c64-core.cpp" /tmp/c64-impl.o \
            -o "{{chips_out_dir}}/c64-core.js" \
            -lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH=1 \
            -sEXPORT_NAME=createC64Core -sFILESYSTEM=0'
    @echo "installed → {{chips_out_dir}}"
    @ls -lh "{{chips_out_dir}}/c64-core."*

# === zx-core.wasm pipeline (chips systems/zx.h) ===

zx_out_dir := justfile_directory() / "src/plugins/emulator-zx-chips/wasm"

# Compile the ZX Embind wrapper + chips core to an ES6 module (mirror
# build-chips-wasm). Reuses the chips checkout from clone-chips. The ZX 48K ROM
# is Amstrad-redistributable and ships under emulator-zx-chips/roms/, handed to
# the core at init. Requires the wasm shell: `nix develop .#wasm`.
build-zx-wasm: clone-chips compile-zx-wasm

compile-zx-wasm:
    cd "{{justfile_directory()}}" && nix --experimental-features 'nix-command flakes' develop .#wasm --command bash -c \
        'set -e; \
         emcc -Oz -std=gnu11 -I "{{chips_dir}}" -c "{{zx_out_dir}}/zx-impl.c" -o /tmp/zx-impl.o; \
         em++ -Oz -std=c++17 -Wno-gnu-anonymous-struct -Wno-nested-anon-types -I "{{chips_dir}}" \
            "{{zx_out_dir}}/zx-core.cpp" /tmp/zx-impl.o \
            -o "{{zx_out_dir}}/zx-core.js" \
            -lembind -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web -sALLOW_MEMORY_GROWTH=1 \
            -sEXPORT_NAME=createZxCore -sFILESYSTEM=0'
    @echo "installed → {{zx_out_dir}}"
    @ls -lh "{{zx_out_dir}}/zx-core."*

# === z80asm.wasm + appmake.wasm pipeline (z88dk, asm-first) ===

z88dk_build_dir := justfile_directory() / "_notes/z88dk-wasm-spike/build"
z88dk_src_dir   := z88dk_build_dir / "z88dk"
z88dk_out_dir   := justfile_directory() / "src/plugins/toolchain-z88dk/wasm"
z88dk_support   := justfile_directory() / "build-support/z88dk"
z88dk_repo      := `python3 scripts/third-party.py get source.z88dk.upstream`
z88dk_commit    := `python3 scripts/third-party.py get source.z88dk.ref`

# Full pipeline: fetch wasi-sdk (shared with cc65), clone z88dk + its ext
# submodules at the pinned commit, build z80asm + appmake to wasm (patch-at-build:
# parse1.c split + stubs + NO_GMP — see wiki/agents/z88dk-wasm-build.md), install,
# smoke. Needs ~8 GB RAM (the parse1.c split keeps it CI-able). C path = #87.
build-z88dk-wasm: fetch-wasi-sdk clone-z88dk compile-z88dk-wasm verify-z88dk-wasm

# Clone z88dk at the pinned commit + the three ext/ submodules z80asm needs
# (versions pinned by that superproject commit).
clone-z88dk:
    if [ ! -d "{{z88dk_src_dir}}/.git" ]; then \
        git clone "{{z88dk_repo}}" "{{z88dk_src_dir}}"; \
    fi
    cd "{{z88dk_src_dir}}" && git fetch origin "{{z88dk_commit}}" && git checkout "{{z88dk_commit}}"
    cd "{{z88dk_src_dir}}" && git submodule update --init --depth 1 ext/regex ext/optparse ext/uthash

# Compile z80asm (C++17) + appmake (C) to wasm via the build-support script.
compile-z88dk-wasm:
    Z88DK="{{z88dk_src_dir}}" WASI_SDK="{{wasi_sdk_dir}}" OUT="{{z88dk_out_dir}}" \
        SCRATCH="{{z88dk_build_dir}}/scratch" \
        SUPPORT="{{z88dk_support}}" bash "{{z88dk_support}}/build-z88dk.sh"
    @ls -lh "{{z88dk_out_dir}}/"*.wasm

# Smoke: assemble build-support/z88dk/smoke.asm with the fresh z80asm.wasm, wrap
# it to a .tap with appmake +zx, check the assembled opcode bytes + tap header.
verify-z88dk-wasm:
    rm -rf /tmp/z88dk-verify && mkdir -p /tmp/z88dk-verify/tmp
    cp "{{z88dk_support}}/smoke.asm" /tmp/z88dk-verify/
    WASI_DIR=/tmp/z88dk-verify node --no-warnings "{{justfile_directory()}}/build-support/cc65/wasi-run.mjs" \
        "{{z88dk_out_dir}}/z80asm.wasm" -b -mz80 /smoke.asm
    @echo "smoke.bin bytes (expect 3e 02 d3 fe c9):"
    @xxd /tmp/z88dk-verify/smoke.bin | head -1
    WASI_DIR=/tmp/z88dk-verify node --no-warnings "{{justfile_directory()}}/build-support/cc65/wasi-run.mjs" \
        "{{z88dk_out_dir}}/appmake.wasm" +zx --binfile /smoke.bin --org 32768 -o /smoke.tap
    @echo "smoke.tap header (expect 13 00 00 00 = 19-byte BASIC header):"
    @xxd /tmp/z88dk-verify/smoke.tap | head -1

# === z88dk C path (#87): zcc + sub-tools + sysroot ===

z88dk_sysroot_src := z88dk_build_dir / "release-2.4"
z88dk_sysroot_ver := `python3 scripts/third-party.py get source.z88dk-sysroot-zx.version`
z88dk_sysroot_url := `python3 scripts/third-party.py get source.z88dk-sysroot-zx.source`

# Full C-path pipeline: build zcc + ucpp + zpragma + sccz80 to wasm (reusing the
# z80asm clone + wasi-sdk), then repackage the +zx sysroot zip from the v2.4
# release. No fork — zcc's system() is shimmed to a host `env.run`. See #87 +
# wiki/agents/z88dk-wasm-build.md "C path".
build-z88dk-c: fetch-wasi-sdk clone-z88dk compile-z88dk-c fetch-z88dk-release package-zx-sysroot

# Compile the C driver + sub-tools to wasm (patch-at-build: vasprintf, shim, stubs).
compile-z88dk-c:
    Z88DK="{{z88dk_src_dir}}" WASI_SDK="{{wasi_sdk_dir}}" OUT="{{z88dk_out_dir}}" \
        SCRATCH="{{z88dk_build_dir}}/scratch-c" \
        SUPPORT="{{z88dk_support}}" bash "{{z88dk_support}}/build-z88dk-c.sh"
    @ls -lh "{{z88dk_out_dir}}/"{zcc,zcpp,zpragma,sccz80}.wasm

# Download + extract the z88dk v2.4 binary release (precompiled +zx clibs/headers).
fetch-z88dk-release:
    if [ ! -d "{{z88dk_sysroot_src}}/z88dk/lib/config" ]; then \
        mkdir -p "{{z88dk_sysroot_src}}"; \
        curl -fsSL "{{z88dk_sysroot_url}}" -o "{{z88dk_build_dir}}/z88dk-release-{{z88dk_sysroot_ver}}.zip"; \
        unzip -q -o "{{z88dk_build_dir}}/z88dk-release-{{z88dk_sysroot_ver}}.zip" -d "{{z88dk_sysroot_src}}"; \
    fi

# Repackage the minimal +zx C sysroot into src/plugins/toolchain-z88dk/zx-sysroot.zip.
package-zx-sysroot:
    bash "{{z88dk_support}}/c-path/build-zx-sysroot.sh" "{{z88dk_sysroot_src}}/z88dk"

# === docs site (Astro Starlight) ===

docs_dir := justfile_directory() / "docs"

# Serve the docs locally at http://localhost:4321/docs/.
docs-dev:
    cd "{{docs_dir}}" && pnpm install && pnpm dev

# Build the static docs site into docs/dist/.
docs-build:
    cd "{{docs_dir}}" && pnpm install && pnpm build

# Regenerate the third-party licence table from third-party.toml (run after bumping a pin).
third-party-docs:
    python3 scripts/third-party.py docs

# === release ===

# Full release flow: gates → bump → changelog → commit → sign tag → push → gh
# release. Usage: `just release 0.12.0` (bare X.Y.Z, no `v`).
#
# The previous release MUST be tagged (it's git-cliff's changelog boundary) —
# every release this recipe cuts leaves the right tag for the next one.
# Deploy is SEPARATE: docker build + push registry.mikolajczyk.org/madside:latest;
# the VPS webapps-update timer pulls `latest` every 5 min (version tags don't
# drive deploy).

# Cut a release end-to-end (gates, bump, changelog, signed tag, push, gh release).
release version:
    #!/usr/bin/env bash
    set -euo pipefail
    ver="{{version}}"
    tag="v$ver"

    # --- preflight: fail before mutating anything ---
    if ! [[ "$ver" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "✗ version must be X.Y.Z (got '$ver')"; exit 1
    fi
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        echo "✗ tag $tag already exists"; exit 1
    fi
    if grep -q "^## \[$ver\]" CHANGELOG.md; then
        echo "✗ CHANGELOG.md already has a [$ver] section — reset it before re-running"; exit 1
    fi
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ "$branch" != "main" ]; then echo "✗ not on main (on '$branch')"; exit 1; fi
    if [ -z "$(git tag)" ]; then
        echo "✗ no prior tag — git-cliff has no boundary. Tag the last release first."; exit 1
    fi

    # --- quality gates (build runs tsc -b + vite build) ---
    echo "▸ lint…";  npm run lint
    echo "▸ test…";  npx vitest run
    echo "▸ build…"; npm run build

    # Warm the gpg agent now so the commit + tag below don't hit the first-use
    # pinentry timeout mid-release (the documented gotcha).
    echo "▸ warming gpg…"; echo release | gpg --clearsign >/dev/null 2>&1 || true

    # --- mutate: bump, changelog, third-party table, commit, tag ---
    echo "▸ bump → $ver"; npm pkg set version="$ver"
    echo "▸ changelog…"; npx -y git-cliff@latest --unreleased --tag "$tag" --prepend CHANGELOG.md
    echo "▸ third-party table…"; python3 scripts/third-party.py docs
    git add package.json CHANGELOG.md docs/src/content/docs/reference/third-party.md
    git commit -S -m "chore(release): $tag"
    git tag -s "$tag" -m "$tag"

    # --- publish ---
    echo "▸ push…"; git push origin main; git push origin "$tag"
    notes="$(mktemp)"
    awk -v v="$ver" '$0 ~ "^## \\[" v "\\]" {f=1; next} /^## \[/ {f=0} f' CHANGELOG.md > "$notes"
    gh release create "$tag" --title "$tag" --notes-file "$notes" --verify-tag
    rm -f "$notes"
    echo "✓ released $tag — https://github.com/mikolajmikolajczyk/madside/releases/tag/$tag"
