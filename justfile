# madside build orchestration. Run `just` for the list.
# Requires (host tooling): fpc 3.2.2+, gnumake, wasmtime, git, node/npm.
# Recommend running build-mads-wasm inside `nix-shell -p fpc gnumake wasmtime`.

set shell := ["bash", "-cu"]

# Repo paths
spike_dir       := justfile_directory() / "_notes/wasm-spike"
build_dir       := spike_dir / "build"
fpc_dir         := build_dir / "fpc-src"
mads_dir        := build_dir / "Mad-Assembler"
wasm_out        := justfile_directory() / "src/plugins/toolchain-mads/wasm-mads/mads.wasm"

# Pinned upstream commits — bump deliberately, then rebuild.
fpc_repo        := "https://gitlab.com/freepascal.org/fpc/source.git"
fpc_commit      := "17c002e6460417e6980fcae2affe6e5bbb00bd6a"
mads_repo       := "https://github.com/tebe6502/Mad-Assembler.git"
mads_commit     := "11c15fdf65d1694ca9bb5f3f2b33bf616e586a77"

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
    cp "{{spike_dir}}/crt.pas" "{{mads_dir}}/crt.pas"
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
    cp "{{spike_dir}}/smoke.a65" "{{mads_dir}}/smoke.a65"
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

cc65_spike_dir  := justfile_directory() / "_notes/ca65-wasm-spike"
cc65_build_dir  := cc65_spike_dir / "build"
wasi_sdk_dir    := cc65_build_dir / "wasi-sdk"
cc65_src_dir    := cc65_build_dir / "cc65"
cc65_out_dir    := justfile_directory() / "src/plugins/toolchain-ca65/wasm"
cc65_plugin_dir := justfile_directory() / "src/plugins/toolchain-ca65"
# cc65 targets to build a sysroot for (one zip each). Add a target here + a row
# in the plugin's CC65_TARGET / SYSROOT_URL maps to support another platform.
cc65_targets    := "nes atari"

# Pinned upstream — bump deliberately, then rebuild + smoke + commit the wasm.
cc65_repo       := "https://github.com/cc65/cc65.git"
cc65_commit     := "cc3c40c54e51b2d9a22b63c85c418a2b11763377"
wasi_sdk_ver    := "33"
wasi_sdk_asset  := "wasi-sdk-33.0-x86_64-linux.tar.gz"

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
        python3 "{{cc65_spike_dir}}/make-sysroot-zip.py" "{{cc65_src_dir}}" "$t" "$out"; \
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
    cp "{{cc65_spike_dir}}/hello.s" "{{cc65_spike_dir}}/none.cfg" /tmp/cc65-verify/
    WASI_DIR=/tmp/cc65-verify node --no-warnings "{{cc65_spike_dir}}/wasi-run.mjs" "{{cc65_out_dir}}/ca65.wasm" -o /hello.o /hello.s
    WASI_DIR=/tmp/cc65-verify node --no-warnings "{{cc65_spike_dir}}/wasi-run.mjs" "{{cc65_out_dir}}/ld65.wasm" -C /none.cfg -o /hello.bin /hello.o
    @echo "hello.bin bytes (expect a9 42 8d 00 02 60):"
    @xxd /tmp/cc65-verify/hello.bin | head -1

# Wipe the cc65 build dir (forces re-download of wasi-sdk + re-clone).
clean-cc65-build:
    rm -rf "{{cc65_build_dir}}"

# === altirra-core.wasm pipeline ===

altirra_dir         := justfile_directory() / "_notes/altirra"
altirra_build_dir   := altirra_dir / "build/wasm-embed"
altirra_out_dir     := justfile_directory() / "src/adapters/emu/wasm"

# Full pipeline: configure (if needed), build wasm embed core, install to public/altirra/.
# Requires the nix dev shell from _notes/altirra/flake.nix.
build-altirra-wasm: altirra-configure altirra-compile install-altirra-wasm

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

# === docs site (Astro Starlight) ===

docs_dir := justfile_directory() / "docs"

# Serve the docs locally at http://localhost:4321/docs/.
docs-dev:
    cd "{{docs_dir}}" && pnpm install && pnpm dev

# Build the static docs site into docs/dist/.
docs-build:
    cd "{{docs_dir}}" && pnpm install && pnpm build
