#!/bin/sh
set -eu

if [ -n "${IN_NIX_SHELL:-}" ]; then
  exec ./node_modules/.bin/tsx server.ts
fi

if ! command -v nix >/dev/null 2>&1; then
  echo "Nix is required. Install Nix or run the packaged NixHost application." >&2
  exit 1
fi

exec nix develop --command ./node_modules/.bin/tsx server.ts
