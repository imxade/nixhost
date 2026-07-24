#!/usr/bin/env bash
set -euo pipefail
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"
export NIXHOST_DATA_DIR="${NIXHOST_DATA_DIR:-$HOME/.local/share/nixhost}"
mkdir -p "$NIXHOST_DATA_DIR"
exec pnpm start
