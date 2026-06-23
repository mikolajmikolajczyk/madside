# Build the madside SPA + the Astro docs, serve both as static files.
# Image is pushed to registry.mikolajczyk.org/madside and auto-pulled by the VPS
# (see mikvps webapps.nix). Served at madside.mikolajczyk.org — app at /, docs at /docs.

# --- build -----------------------------------------------------------------
# node:22-slim (glibc) avoids the sharp/esbuild musl friction of alpine.
# Pinned to a manifest digest for reproducible builds; the tag stays for
# readability. Dependabot (docker ecosystem) bumps the digest.
FROM node:26-slim@sha256:191ef878ecb351d68b78219593de18bd8942afd59af59f29960dc4b24805a3f1 AS build
# Pin pnpm to the lockfile's version (also declared as packageManager in
# package.json — corepack honours it, this keeps the image self-contained).
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /app

# Install app deps first (better layer caching), then build the SPA.
# pnpm-workspace.yaml carries the build-script allowlist — needed at install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Docs (apps/docs) is part of the single root workspace (#89) — its deps were
# installed above; just build it.
RUN pnpm --filter @madside/docs build

# --- runtime ---------------------------------------------------------------
# static-web-server: single ~5 MB scratch binary, built-in SPA fallback.
# Pinned to a manifest digest (Dependabot bumps it).
FROM ghcr.io/static-web-server/static-web-server:2@sha256:6acea6260b14e08dda986361e42640082fbfaab8d88c327de532bb13a3b22994
# App at the root, docs under /docs (Astro built with base "/docs").
COPY --from=build /app/apps/ide/dist /public
COPY --from=build /app/apps/docs/dist /public/docs
# Security headers + caching + compression live in the config file; the SERVER_*
# env below still set the startup essentials (env wins over the file), so a
# config typo can only drop headers, never stop the server booting.
COPY static-web-server.toml /etc/sws.toml
ENV SERVER_PORT=3004 \
    SERVER_ROOT=/public \
    SERVER_FALLBACK_PAGE=/public/index.html \
    SERVER_CONFIG_FILE=/etc/sws.toml \
    SERVER_HEALTH=true
# Drop root: the static binary only needs to read /public + bind 3004 (>1024),
# both fine for an unprivileged uid. Numeric uid works on the scratch image
# (no /etc/passwd needed).
USER 10001
EXPOSE 3004
# The scratch runtime ships no shell/curl, so there's no in-container probe to
# wire a Docker HEALTHCHECK to. SERVER_HEALTH exposes GET /health; liveness is
# probed externally by the VPS reverse proxy (Caddy / mikvps), which fronts this
# container — see mikvps webapps.nix.
