# Container image and Kubernetes deployment

This directory adds a container image that serves one DSH Web host and the
Kubernetes objects needed to run it. Everything outside `deploy/` is upstream
except the one authentication hook described below.

## What the image contains

The builder repeats the packaging steps of
[`.github/workflows/release.yml`](../.github/workflows/release.yml): an official
build, the `dsh` and `vendor` release families packed to tarballs, the Landlock
entry package packed on its own, and a consumer install assembled from those
tarballs the way `scripts/release/verify-packed-install.ts` proves it. The
runtime layer copies only that consumer install, so it carries no source tree,
no pnpm, and no build toolchain.

Runtime packages: `bash`, `git`, `ca-certificates`, `tini`. The agent needs
`bash` and `git`; `tini` reaps orphans and forwards signals, because `dsh`
spawns shell children.

## The authentication hook

[`packages/client/connection/src/browser-auth.ts`](../packages/client/connection/src/browser-auth.ts)
reads `DSH_PROXY_AUTH_HEADER` once at module load. When it names a request
header, `isAuthenticated` admits a request as the owner Peer if that header is
present with a non-empty value, before the launch-token exchange and the cookie
check.

| `DSH_PROXY_AUTH_HEADER` | Request headers | Result |
|---|---|---|
| unset | anything | existing cookie and launch-token flow, unchanged |
| set | header absent, empty, or whitespace only | falls back to the cookie check |
| set | header present with a non-empty value | admitted as the owner Peer |

This grants trust to whoever can set that header. Set it only when every path to
the port passes through a proxy that overwrites the header on each request.
`deploy/k8s/middleware-forwardauth.yaml` is the intention for that proxy; it is
not wired into `kustomization.yaml` yet.

## Build

Build from the repository root so `COPY . .` sees the whole checkout, including
`.git`, which `build:official` reads for the embedded commit hash.

```sh
docker build -f deploy/Dockerfile -t <registry>/dsh-online:0.2.2-rc.1-proxy-auth .
```

The image is roughly 2.8 GB; most of it is the consumer install of every
released package.

## Runtime

`deploy/entrypoint.sh` builds the argument list and execs the installed `dsh`.

| Variable | Required | Meaning |
|---|---|---|
| `POD_IP` | yes | bind address, from the downward API; `--host` rejects wildcards |
| `DSH_PORT` | no | listener port, default `3080` |
| `DSH_PUBLIC_URL` | no | advertised root; passed as `--public-url` |
| `DSH_TRUSTED_HOST` | no | extra accepted authority; passed as `--trusted-host` |
| `DSH_HOME` | no | state directory, set to `/data/dsh` in the image |
| `DSH_PERMISSION_MODE` | no | `danger-full-access` in the image, so the agent is confined by the container only |
| `DSH_PROXY_AUTH_HEADER` | no | see above; empty in the image |

The image exposes one authority through `DSH_TRUSTED_HOST`. A deployment that
needs several can extend the entrypoint.

## Manifests

| File | Content |
|---|---|
| `k8s/namespace.yaml` | the `dsh` namespace |
| `k8s/pvc.yaml` | `dsh-home` at `/data/dsh` and `dsh-workspace` at `/workspace` |
| `k8s/deployment.yaml` | one replica, `Recreate` updates, TCP readiness and liveness |
| `k8s/service.yaml` | ClusterIP on 3080 |
| `k8s/ingress.yaml` | Traefik ingress for the host |
| `k8s/middleware-forwardauth.yaml` | forwardAuth middleware, applied once oauth2-proxy exists |
| `k8s/kustomization.yaml` | the five objects above, without the middleware |

Placeholders to fill before applying: the image reference, both host names, and
`storageClassName` on the claims. `fsGroup: 1000` assumes the storage plugin
supports ownership changes; where it does not, the home volume is not writable
by the container user and needs an init container or root.

Updates use `Recreate` because one home directory is written by one process.

## Upgrade

The patch is one commit on top of an upstream tag.

```sh
git fetch upstream
git rebase upstream/master        # or the new release tag
docker build -f deploy/Dockerfile -t <registry>/dsh-online:<new tag> .
docker push <registry>/dsh-online:<new tag>
```

Rebuild the image whenever the patch, the build scripts, or the base image
change; a moved upstream tag alone does not require touched manifests.

## Known limitations

- One replica. The session store, credentials, and cookie signing key belong to
  one home directory and one process.
- Nothing restricts traffic to the Pod port. Any workload in the cluster can
  reach it and forge the authentication header.
- The startup line prints a token-bearing URL to the container log, and that log
  is readable by anyone with log access.
- There is no dedicated health endpoint. Readiness is a TCP check on the port,
  so the Pod is routed to before the API is ready; the browser client retries.
- The built-in sandbox is disabled through `DSH_PERMISSION_MODE`. Command
  isolation is the container boundary.
- The image is amd64 only. `node:24-bookworm-slim` for the builder and the
  Landlock entry package both follow the build host.
