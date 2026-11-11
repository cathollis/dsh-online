#!/bin/sh
#
# Start the Web profile on the Pod's own address. `--host` accepts one concrete
# local address, so the address comes from the downward API rather than a wildcard.

set -eu

: "${POD_IP:?POD_IP must be provided from status.podIP}"
: "${DSH_PORT:=3080}"
: "${DSH_HOME:=/data/dsh}"

# User-space installs land in these prefixes and survive the container. A volume
# mounted here hides the directories the image created, so recreate them.
export PATH="/data/tools/bin:/data/tools/npm/bin:/data/tools/py/bin:$PATH"
mkdir -p /data/tools/bin /data/tools/npm/bin /data/tools/py/bin

# Seed the environment instructions and the toolbox skill on first start; an
# edited copy in the volume wins over the image.
mkdir -p "$DSH_HOME/skills"
if [ ! -f "$DSH_HOME/AGENTS.md" ]; then
  cp /opt/dsh-env/AGENTS.md "$DSH_HOME/AGENTS.md"
fi
if [ ! -d "$DSH_HOME/skills/container-toolbox" ]; then
  cp -R /opt/dsh-env/skills/container-toolbox "$DSH_HOME/skills/"
fi

set -- --profile web --no-open --host "$POD_IP" --port "$DSH_PORT"

if [ -n "${DSH_PUBLIC_URL:-}" ]; then
  set -- "$@" --public-url "$DSH_PUBLIC_URL"
fi

if [ -n "${DSH_TRUSTED_HOST:-}" ]; then
  set -- "$@" --trusted-host "$DSH_TRUSTED_HOST"
fi

exec /opt/dsh/node_modules/.bin/dsh "$@"
