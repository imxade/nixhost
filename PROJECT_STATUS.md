# Implementation Status

## Implemented in source

- Next.js App Router dashboard and custom persistent server.
- First-run local token, owner account, login throttling and revocable sessions.
- Owner/admin/operator/viewer authorization and user management.
- SQLite WAL database and initial migration.
- AES-GCM encrypted application and integration secrets.
- Application CRUD, environment variables and desired state.
- Durable deployment queue with superseding and cancellation markers.
- Git mirror/worktree release preparation.
- Mandatory `flake.nix`/`flake.lock` validation and flake output inspection.
- Detached Nix application process groups and file-backed logs.
- Health checks, atomic route switching and previous-release preservation.
- Stable LAN HTTP/WebSocket proxy ports.
- SSE event and log streaming.
- Host and Linux process-group metrics.
- GitHub App manifest, installations, repository listing, signed webhooks and branch polling.
- Cloudflare tunnel creation, DNS/ingress synchronization and process lifecycle.
- Control-plane restart recovery.
- Responsive daisyUI dashboard.
- Biome-only formatting, linting, and import organization with no ESLint dependency or configuration.
- Nix development/package definition, diagnostics, tests and documentation.

## Validation completed here

- Repository/file generation and JSON syntax validation.
- TypeScript syntax transpilation completed for all 99 TypeScript/TSX entry and source files with zero syntax errors.
- Shell syntax validation completed for launch and host-verification scripts.
- Confirmed no ESLint dependency, script, workflow step, or configuration exists.
- Static manual review of security boundaries and state transitions.
- TypeScript parser run with the globally available compiler; full type resolution was impossible because dependencies are not installed.

## Not executable in this environment

This environment has no working npm registry access and no Nix installation. Therefore the following claims are deliberately **not** made:

- `pnpm install` completed;
- exact dependency graph or lock file is valid;
- full TypeScript typecheck passed;
- Next.js production build passed;
- native SQLite addon compiled;
- Nix package built;
- GitHub/Cloudflare live integrations passed;
- Nix-on-Droid lifecycle passed.

## Required before release

1. Run the local-agent prompt.
2. Commit generated lock files and real Nix dependency hash.
3. Resolve every type/build/test warning without bypassing checks.
4. Validate log retention and backup/restore under crash and storage-pressure tests.
5. Verify PID start-time identity before recovery signals.
6. Complete two-device Android feasibility matrix.
7. Perform dependency/security audit and external review.
8. Confirm license compatibility and copyright notices for all distributed dependencies.
