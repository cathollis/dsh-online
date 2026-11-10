#!/bin/sh
#
# Start the Web profile on the Pod's own address. `--host` accepts one concrete
# local address, so the address comes from the downward API rather than a wildcard.

set -eu

: "${POD_IP:?POD_IP must be provided from status.podIP}"
: "${DSH_PORT:=3080}"

set -- --profile web --no-open --host "$POD_IP" --port "$DSH_PORT"

if [ -n "${DSH_PUBLIC_URL:-}" ]; then
  set -- "$@" --public-url "$DSH_PUBLIC_URL"
fi

if [ -n "${DSH_TRUSTED_HOST:-}" ]; then
  set -- "$@" --trusted-host "$DSH_TRUSTED_HOST"
fi

exec /opt/dsh/node_modules/.bin/dsh "$@"
