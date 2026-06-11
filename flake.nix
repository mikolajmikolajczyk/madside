{
  description = "madside — browser-native IDE for retro hardware";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Default shell: native binaries every contributor needs. JS-only
        # tools (eslint, prettier, typescript, knip, madge, markdownlint)
        # live in package.json devDependencies — `pnpm install` provides
        # them via node_modules/.bin, which pre-commit hooks call directly.
        # That way the JS tooling versions are pinned alongside the source
        # they lint, instead of in a parallel nixpkgs revision.
        defaultTools = with pkgs; [
          # JS runtime
          nodejs_22
          pnpm
          just

          # Standalone analyzers (not npm packages)
          shellcheck

          # Pre-commit framework (Python)
          pre-commit

          # Security scanning (Go binaries)
          trivy
          gitleaks

          # Nix file hygiene
          nixfmt
          statix
          deadnix

          # The UID-guard pre-commit hook needs gpg in PATH
          gnupg

          # Workflow
          git
          radicle-node

          # Dep-graph audit (madge --image needs `dot`)
          graphviz
        ];

        # Heavy wasm rebuild toolchain — only needed when bumping the
        # bundled mads.wasm / altirra-core.wasm pins. Most contributors
        # never need this shell.
        wasmTools = with pkgs; [
          cmake
          ninja
          pkg-config
          gcc
          emscripten
          fpc
          sdl3
        ];
      in
      {
        devShells.default = pkgs.mkShell {
          packages = defaultTools;

          shellHook = ''
            echo "madside dev shell"
            echo "  node:   $(node --version)"
            echo "  pnpm:   $(pnpm --version)"
            echo "  just:   $(just --version)"
            echo ""
            echo "  Tests:        pnpm test"
            echo "  Dev server:   pnpm dev"
            echo "  Wasm rebuild: nix develop .#wasm"
            echo ""
          '';
        };

        # Opt-in: cmake/emscripten/fpc are heavy. Only enter this shell
        # when you actually need to rebuild a wasm artifact.
        devShells.wasm = pkgs.mkShell {
          packages = defaultTools ++ wasmTools;

          shellHook = ''
            export EM_CACHE="$PWD/.emcache"
            echo "madside wasm rebuild shell"
            echo "  cmake: $(cmake --version | head -1)"
            echo "  emcc:  $(emcc --version | head -1)"
            echo "  fpc:   $(fpc -iV)"
            echo ""
            echo "  Rebuild mads.wasm:    just build-mads-wasm"
            echo "  Rebuild altirra wasm: just build-altirra-wasm"
            echo ""
          '';
        };
      }
    );
}
