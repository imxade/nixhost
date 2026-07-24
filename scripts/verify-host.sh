#!/usr/bin/env bash
set -euo pipefail
fail=0
for command in node pnpm git nix; do
  if command -v "$command" >/dev/null 2>&1; then printf 'ok  %-12s %s\n' "$command" "$(command -v "$command")"; else printf 'ERR %-12s missing\n' "$command"; fail=1; fi
done
if command -v cloudflared >/dev/null 2>&1; then printf 'ok  %-12s %s\n' cloudflared "$(command -v cloudflared)"; else printf 'note %-12s install only when enabling Cloudflare Tunnel\n' cloudflared; fi
printf '\nNode: %s\n' "$(node --version 2>/dev/null || true)"
printf 'Nix system: %s\n' "$(nix eval --raw --impure --expr builtins.currentSystem 2>/dev/null || echo unavailable)"
printf 'Architecture: %s\n' "$(uname -m)"
printf 'Kernel: %s\n' "$(uname -srm)"
exit "$fail"
