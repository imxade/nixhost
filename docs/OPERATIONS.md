# Operations

## Environment variables

See `.env.example`. The important values are:

```text
HOSTNAME=0.0.0.0
PORT=3000
NIXHOST_DATA_DIR=~/.local/share/nixhost
NIXHOST_MASTER_KEY=<base64 32-byte key, recommended>
NIXHOST_PUBLIC_URL=<optional stable HTTPS origin>
NIXHOST_BUILD_CONCURRENCY=1
NIXHOST_GIT_POLL_SECONDS=60
NIXHOST_METRICS_SECONDS=5
NIXHOST_MIN_FREE_DISK_MB=1024
NIXHOST_MIN_FREE_MEMORY_MB=256
```

## Backup

Create a consistent backup with `pnpm backup -- /path/to/target` (or `nixhost-backup`). It uses SQLite's online backup API and archives application data. Preserve:

- SQLite database;
- secrets key or external master key;
- application persistent data;
- optionally logs and Git mirrors.

The Nix store and releases can be reconstructed from repositories and lock files.

## Recovery

- If the dashboard crashes, detached active apps should continue.
- Restart NixHost; it reconciles process records and deployment state.
- Interrupted builds are marked interrupted rather than assumed successful.
- If SQLite integrity fails, stop the service and restore a verified backup; do not delete the database blindly.
- If the encryption key is lost, encrypted GitHub/Cloudflare/application secrets cannot be recovered.

## Log retention

Completed deployment logs are removed after `NIXHOST_LOG_RETENTION_DAYS` and oldest inactive logs are removed when total log usage exceeds `NIXHOST_LOG_MAX_MB`. Active deployment logs are excluded. Metric samples are pruned after seven days.

## Nix store pressure

NixHost checks free filesystem space before builds but does not automatically garbage-collect the Nix store. Run garbage collection deliberately after confirming no required generations or roots will be removed. A future UI action should show the exact closure impact before cleanup.

## Updating

1. Stop accepting new deployments.
2. Build and test the new control-plane package.
3. Stop only the Next.js control plane.
4. Start the new version against the existing data directory.
5. Verify migrations and process reconciliation.
6. Roll back the control-plane package if startup fails.

Do not automatically restart active hosted applications solely for a dashboard update.
