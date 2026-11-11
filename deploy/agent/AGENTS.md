# Container environment

You run inside a container image built for one DSH Web host. Its filesystem is
not a laptop: some paths persist and some disappear when the Pod restarts.

## Identity and writable paths

- The process runs as uid 1000 on Debian bookworm. There is no root.
- `/usr`, `/var`, and `/etc` are read-only for you. `apt` and `sudo` fail.
- `/data/dsh` holds the session store, credentials, settings, and these
  instructions. It survives a restart.
- `/workspace` is the working directory and survives a restart.
- `/data/tools` is writable and survives a restart. It is the place for
  anything you install yourself.
- Every other path is container-local. Files there disappear on restart.

## Tools already installed

`bash`, `git`, `curl`, `jq`, `unzip`, `zip`, `less`, `tree`, `procps`,
`ripgrep` (`rg`), `fd` (`fdfind`, with `/usr/bin/fd` linked), `bat`, `file`,
`sqlite3`, `zstd`, `xz`, `openssh-client`, `python3` with `venv` and `pipx`,
`ffmpeg`, `convert` and `identify` from ImageMagick 6, `rsvg-convert`, `pdftoppm` and
`pdfinfo` from poppler, `gs`, `cwebp` and `dwebp`, `exiftool`, and the
`Noto CJK` and `DejaVu` font families.

Run `command -v <name>` before assuming a tool is missing.

## Installing without root

`/data/tools` is on `PATH` through `/data/tools/bin`, `/data/tools/npm/bin`,
and `/data/tools/py/bin`. Install into those prefixes instead of the system.

- Single static binary: download or unpack into `/data/tools/bin` and
  `chmod +x` it.
- Python: prefer `uv venv /data/tools/venvs/<name>` and then
  `/data/tools/venvs/<name>/bin/pip install`; `pipx install --home
  /data/tools/pipx` works for single applications. `pip install --user`
  writes under `/data/dsh`, which is acceptable but mixes with state.
- Node: `npm install -g --prefix /data/tools/npm <package>`.
- Rust: export `RUSTUP_HOME=/data/tools/rustup` and
  `CARGO_HOME=/data/tools/cargo`, then install with rustup.
- Go: unpack the toolchain into `/data/tools/go` and set `GOROOT` plus
  `PATH`.
- Anything requiring CMake, a C toolchain, or system libraries is out of
  reach. So is any package whose runtime needs libraries the image lacks.

## When root is required

A task sometimes needs a system package: a codec ImageMagick does not decode, a
database server, a compiler toolchain, a library with no self-contained build.
When that happens, stop and tell the user which Debian packages would be added
and why, then wait. Do not attempt `sudo`, `apt-get`, or writing outside the
writable paths.

Say what you tried, the exact failing command, and the package list you need, so
the user can rebuild the image once.

## Conventions

- Keep installed tools under `/data/tools`, never in `/workspace`, so work
  directories stay clean and tools survive across projects.
- Large generated artifacts belong in `/workspace`, not in `/data/dsh`.
- `TZ` is not set. Timestamps are UTC unless the user says otherwise.
