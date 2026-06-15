# Build the madside SPA + the Astro docs, serve both as static files.
# Image is pushed to registry.mikolajczyk.org/madside and auto-pulled by the VPS
# (see mikvps webapps.nix). Served at madside.mikolajczyk.org — app at /, docs at /docs.

# --- build -----------------------------------------------------------------
# node:22-slim (glibc) avoids the sharp/esbuild musl friction of alpine.
FROM node:22-slim AS build
# Pin pnpm to the lockfile's version (repo has no packageManager field).
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate
WORKDIR /app

# Install app deps first (better layer caching), then build the SPA.
# pnpm-workspace.yaml carries the build-script allowlist — needed at install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Docs is a self-contained pnpm workspace (own lockfile + allowBuilds).
RUN cd docs && pnpm install --frozen-lockfile && pnpm build

# --- runtime ---------------------------------------------------------------
# static-web-server: single ~5 MB scratch binary, built-in SPA fallback.
FROM ghcr.io/static-web-server/static-web-server:2
# App at the root, docs under /docs (Astro built with base "/docs").
COPY --from=build /app/dist /public
COPY --from=build /app/docs/dist /public/docs
# Security headers + caching + compression live in the config file; the SERVER_*
# env below still set the startup essentials (env wins over the file), so a
# config typo can only drop headers, never stop the server booting.
COPY static-web-server.toml /etc/sws.toml
ENV SERVER_PORT=3004 \
    SERVER_ROOT=/public \
    SERVER_FALLBACK_PAGE=/public/index.html \
    SERVER_CONFIG_FILE=/etc/sws.toml
EXPOSE 3004
