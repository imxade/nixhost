# Operations

## Environment variables

See `.env.example`. The important values are:

```text
HOSTNAME=0.0.0.0
PORT=3000
NIXHOST_DATA_DIR=~/.local/share/nixhost
NIXHOST_MASTER_KEY=<base64 32-byte key, recommended>
NIXHOST_PUBLIC_URL=<optional stable HTTPS origin>
NIXHOST_QUICK_TUNNELS_ENABLED=true
NIXHOST_QUICK_TUNNEL_RECONCILE_SECONDS=10
NIXHOST_CLOUDFLARE_OAUTH_ENABLED=false
NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID=<optional public OAuth client ID>
NIXHOST_CLOUDFLARE_OAUTH_REDIRECT_URI=<exact registered callback URI>
NIXHOST_CLOUDFLARE_OAUTH_SCOPES=<exact space-delimited client scopes>
NIXHOST_BUILD_CONCURRENCY=1
NIXHOST_GIT_POLL_SECONDS=60
NIXHOST_METRICS_SECONDS=5
NIXHOST_MIN_FREE_DISK_MB=1024
NIXHOST_MIN_FREE_MEMORY_MB=256
```

The Cloudflare client must be registered as a public Authorization Code client
with PKCE and token endpoint authentication method `none`. Never ship a
Cloudflare OAuth client secret in this repository or the future APK. The
redirect URI must resolve back to
`/api/cloudflare/oauth/callback`; a loopback URI is suitable only when the
browser and NixHost run on the same device.

OAuth is an optional provider module and defaults off. Turn it on only after its
client and callback have been independently tested. A single
`NIXHOST_CLOUDFLARE_OAUTH_ENABLED=false` disconnects authorization and refresh
without changing account-free Quick Tunnels, manual-token named tunnels, LAN
routing, application deployment, or GitHub integration.

## First-run claim

On an empty data directory, NixHost prints a visually separated LAN setup URL
(or a local URL when explicitly bound to loopback).
When the dashboard Quick Tunnel starts successfully, it prints a second
visually separated URL for that route. If Quick Tunnels are disabled or
`cloudflared` cannot start, only the LAN URL is shown.

Each URL contains the one-time claim credential. Opening it exchanges the
credential for a 30-minute HttpOnly setup cookie and redirects to the clean
`/setup` address, where the owner chooses a username and password. The setup
form never asks for or submits the token. It is a native POST form with an
enhanced client-side handler, so submission remains secure and functional if
JavaScript has not hydrated or is disabled. Successful account creation
consumes the token, removes its private local file, and signs in the new owner.

Authenticated users can change their own password from **Account** after
confirming the current password. The current browser remains signed in and the
user's other sessions are revoked. Sign out is available from the navigation
sidebar.

## Backup

Create a consistent backup with `pnpm backup -- /path/to/target` (or `nixhost-backup`). The target must not already exist. It uses SQLite's online backup API, archives application data, writes SHA-256 checksums, and atomically publishes the completed backup directory. Preserve:

- SQLite database;
- secrets key or external master key;
- application persistent data;
- optionally logs and Git mirrors.

The Nix store and releases can be reconstructed from repositories and lock files. When `NIXHOST_MASTER_KEY` is externally managed, it is deliberately not copied into the backup and must be supplied during verification/restore.

Restore with `pnpm restore -- /path/to/backup` while NixHost is stopped. Restore verifies the manifest, every checksum, archive paths, the master-key mode, SQLite integrity, and foreign keys before replacing current state. A failed replacement rolls the previous database, key, and application directory back into place.

## Automatic deployment

NixHost registers the GitHub App webhook against the best public dashboard route:
custom domain, explicit stable URL, then current dashboard Quick Tunnel. LAN routes
are never used. Branch polling runs periodically regardless of webhook availability
and queues each previously unseen commit once. A failed commit is not retried on
every poll; use **Redeploy latest** for a transient host failure, or push a new
commit with the repository fix.

## Temporary public access

NixHost supervises the dashboard Quick Tunnel and one process per web application.
The URL remains stable while NixHost and that process continue running. A graceful
NixHost shutdown closes managed Quick Tunnels; after a crash, device reboot, or later
restart, a replacement process can receive a new URL. Set
`NIXHOST_QUICK_TUNNELS_ENABLED=false` before startup to keep the node LAN/custom-domain
only. Quick Tunnel URLs remain enabled alongside custom domains.

`cloudflared` can print an assigned hostname before its DNS record is usable.
NixHost keeps that route in **Preparing** and does not expose a clickable URL
until Cloudflare's public DNS-over-HTTPS resolver returns an address and the
public edge reaches the dashboard or intended application proxy. Readiness is
retried for 90 seconds before the process is recycled with backoff.

Source development must use `npm run dev` or `pnpm dev` to run the
lifecycle-owning custom server. Quick Tunnels require `cloudflared` on `PATH`, or
its absolute path in `NIXHOST_CLOUDFLARED_BIN`. Starting Next.js directly
bypasses tunnel cleanup and is unsupported.

The development command forwards Next.js HMR WebSocket upgrades. At startup,
Next.js allows the host's current non-loopback LAN IPv4 addresses as development
origins; restart the command after changing networks so the allowlist is
recomputed. The custom server also accepts the dashboard Quick Tunnel's strict
same-origin HMR upgrade when it arrives from local `cloudflared`; other Quick
Tunnel origins remain blocked. This development-only handling does not alter
production origin checks.

## Recovery

- If the dashboard crashes, detached active apps should continue.
- Restart NixHost; it reconciles process records and deployment state.
- Interrupted builds are marked interrupted rather than assumed successful.
- If SQLite integrity fails, stop the service and restore a verified backup; do not delete the database blindly.
- If the encryption key is lost, encrypted GitHub/Cloudflare/application secrets cannot be recovered.
- If Cloudflare OAuth authorization is revoked or its refresh token expires,
  reconnect from the Cloudflare page. Existing LAN routes continue operating.

## Log retention

Completed deployment logs are removed after `NIXHOST_LOG_RETENTION_DAYS` and oldest inactive logs are removed when total log usage exceeds `NIXHOST_LOG_MAX_MB`. If active append targets alone exceed the hard cap, they are truncated in place so the running process keeps its file descriptor while disk use remains bounded. Metric samples are pruned after seven days.

## Nix store pressure

NixHost checks free filesystem space before builds but does not automatically garbage-collect the Nix store. Run garbage collection deliberately after confirming no required generations or roots will be removed. Automated or dashboard-triggered garbage collection is outside the current product contract because it cannot yet show and preserve the exact required closure safely.

## Updating

1. Stop accepting new deployments.
2. Build and test the new control-plane package.
3. Stop only the Next.js control plane.
4. Start the new version against the existing data directory.
5. Verify migrations and process reconciliation.
6. Roll back the control-plane package if startup fails.

Do not automatically restart active hosted applications solely for a dashboard update.
