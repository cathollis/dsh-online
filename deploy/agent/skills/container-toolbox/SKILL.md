---
name: container-toolbox
description: Use when a command fails because a tool or library is missing inside the DSH container, when a system package seems necessary, or when installing a language runtime or CLI into a writable prefix. Covers the user-space install recipes that work without root and the escalation message to send when they do not.
---

# Container Toolbox

This container runs as uid 1000 with no root. System paths are read-only. Every
install goes to `/data/tools`, which is already on `PATH`.

## First move: is it really missing?

```sh
command -v fd || command -v fdfind
command -v magick || command -v convert
command -v rg
```

Several tools are installed under a different name than expected, and `fd` is
one of them. A missing binary in `PATH` is a different problem from a missing
package.

## Decision order

1. The tool is already installed under another name, or is a subcommand of one
   that is installed: use it.
2. A self-contained binary exists for linux-x64: install it to
   `/data/tools/bin`.
3. A language package covers it: Python through `uv` or `pipx`, Node through
   `npm --prefix`, Rust through `cargo`.
4. The tool needs a C toolchain, CMake, or system libraries: it cannot be
   installed here. Stop and ask the user for a system package.

## Recipes

### Static binary

```sh
mkdir -p /data/tools/bin
curl -fsSL <download-url> -o /tmp/tool.tar.gz
tar -xzf /tmp/tool.tar.gz -C /tmp
install -m 0755 /tmp/<unpacked>/<binary> /data/tools/bin/<name>
command -v <name>
```

For a single binary, `install -m 0755 /tmp/<binary> /data/tools/bin/` is enough.

### Python application

`uv` is not installed; create a virtual environment from the system Python.

```sh
python3 -m venv /data/tools/venvs/<name>
/data/tools/venvs/<name>/bin/pip install <package>
/data/tools/venvs/<name>/bin/<command>
```

Link the entry point for convenience:

```sh
ln -sf /data/tools/venvs/<name>/bin/<command> /data/tools/bin/<command>
```

For a one-off CLI, `pipx install --home /data/tools/pipx <package>` puts the
command under `/data/tools/pipx/bin`.

Do not run `pip install` against the system interpreter; Debian marks it
externally managed and will refuse, and overriding that would write into a
read-only path.

### Node package

```sh
npm install -g --prefix /data/tools/npm <package>
/data/tools/npm/bin/<command>
```

### Rust or Go

```sh
export RUSTUP_HOME=/data/tools/rustup CARGO_HOME=/data/tools/cargo
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
```

Go toolchains unpack into `/data/tools/go`; add `GOROOT=/data/tools/go` and keep
`/data/tools/go/bin` on `PATH`.

## When a system package is unavoidable

Stop before trying `sudo` or `apt-get`. Report:

- the command that failed and its exact error line;
- the capability you need, in one sentence;
- the Debian packages that would provide it, with the reason for each.

Then wait. The user rebuilds the image or changes the deployment; nothing in
this container can install a system package by itself.

## Persistence

`/data/tools` survives Pod restarts and image upgrades. `/tmp` and the rest of
the container filesystem do not. A tool installed to `/usr/local/bin` without a
volume disappears on the next restart, and the failure looks like a regression.
