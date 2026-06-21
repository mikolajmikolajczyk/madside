# madside dev orchestration. Run `just` for the list.
#
# This root justfile carries only the day-to-day dev recipes + the release flow.
# The heavy, rarely-run wasm build machinery lives in build/justfile (dormant,
# host-tooling-only — `cd build && just --list`). See #89/#97.

set shell := ["bash", "-cu"]

# Show available recipes.
default:
    @just --list

# === dev convenience (delegate to the @madside/ide app package) ===

# Start the Vite dev server.
dev:
    npm run dev

# Production build (tsc -b + vite build).
build:
    npm run build

# Preview the production bundle.
preview:
    npm run preview

# TypeScript typecheck across the workspace (solution build).
typecheck:
    npm run typecheck

# Install workspace deps.
install:
    pnpm install

# === docs site (Astro Starlight, @madside/docs) ===

# Serve the docs locally at http://localhost:4321/docs/.
docs-dev:
    pnpm --filter @madside/docs dev

# Build the static docs site.
docs-build:
    pnpm --filter @madside/docs build

# Regenerate the third-party licence table from build/third-party.toml (run after bumping a pin).
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
    echo "▸ test…";  npm test
    echo "▸ build…"; npm run build

    # Warm the gpg agent now so the commit + tag below don't hit the first-use
    # pinentry timeout mid-release (the documented gotcha).
    echo "▸ warming gpg…"; echo release | gpg --clearsign >/dev/null 2>&1 || true

    # --- mutate: bump (root + app, the displayed version), changelog, table, commit, tag ---
    echo "▸ bump → $ver"; npm pkg set version="$ver"; npm --prefix apps/ide pkg set version="$ver"
    echo "▸ changelog…"; npx -y git-cliff@latest --unreleased --tag "$tag" --prepend CHANGELOG.md
    echo "▸ third-party table…"; python3 scripts/third-party.py docs
    git add package.json apps/ide/package.json CHANGELOG.md apps/docs/src/content/docs/reference/third-party.md
    git commit -S -m "chore(release): $tag"
    git tag -s "$tag" -m "$tag"

    # --- publish ---
    echo "▸ push…"; git push origin main; git push origin "$tag"
    notes="$(mktemp)"
    awk -v v="$ver" '$0 ~ "^## \\[" v "\\]" {f=1; next} /^## \[/ {f=0} f' CHANGELOG.md > "$notes"
    gh release create "$tag" --title "$tag" --notes-file "$notes" --verify-tag
    rm -f "$notes"
    echo "✓ released $tag — https://github.com/mikolajmikolajczyk/madside/releases/tag/$tag"
