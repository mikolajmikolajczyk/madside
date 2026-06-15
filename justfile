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
