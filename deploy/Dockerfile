# syntax=docker/dockerfile:1
#
# Image for one DSH host serving the Web GUI over HTTP.
#
# Build from the repository root:
#   docker build -f deploy/Dockerfile -t <registry>/dsh-online:<tag> .
#
# The builder repeats the pack steps of .github/workflows/release.yml and assembles
# a consumer install the way scripts/release/verify-packed-install.ts proves it, so
# the image contains an installation the release pipeline already validates rather
# than a checkout with a build tree.

FROM node:24-bookworm-slim AS builder

# musl-tools supplies musl-gcc for the static Landlock runner; node headers for the
# addons come from the Node installation this image ships.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential \
      musl-tools \
      python3 \
      git \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.28.5 --activate

WORKDIR /src
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm run build:official

RUN pnpm run release:pack --family dsh --out dist/npm --concurrency 8
RUN pnpm run release:pack --family vendor --out dist/npm-vendor --concurrency 8
RUN pnpm --dir native/system run build:ts \
 && pnpm --dir native/system/packages/entry pack --pack-destination /src/dist/npm-landlock

RUN node deploy/assemble-consumer.mjs \
      --out /opt/dsh \
      --from dist/npm \
      --from dist/npm-vendor \
      --from dist/npm-landlock

# Optional dependencies stay: native packages ship their prebuilt binary as a
# platform-specific optional dependency, and npm skips the ones this host cannot
# use. The assembler puts packages whose own os/cpu fields exclude this host into
# that section for the same reason.
RUN cd /opt/dsh \
 && npm install --no-audit --no-fund --package-lock=false


FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash \
      git \
      ca-certificates \
      tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/dsh /opt/dsh
COPY deploy/entrypoint.sh /usr/local/bin/dsh-entrypoint

RUN chmod 0755 /usr/local/bin/dsh-entrypoint \
 && mkdir -p /data/dsh /workspace \
 && chown -R 1000:1000 /data/dsh /workspace

ENV DSH_HOME=/data/dsh \
    DSH_PERMISSION_MODE=danger-full-access \
    DSH_PORT=3080 \
    TZ=Asia/Shanghai \
    LANG=C.UTF-8

WORKDIR /workspace
USER 1000:1000
EXPOSE 3080

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/usr/local/bin/dsh-entrypoint"]
