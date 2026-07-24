# Implementation Status

Last updated: 2026-07-24.

## Implemented

- Next.js App Router dashboard, strict TypeScript APIs and one persistent custom server/runtime.
- One-time owner claim, authenticated sessions, login throttling, role enforcement and user management.
- SQLite WAL state with forward-only, empty-database-tested migrations and encrypted stored secrets.
- Locked GitHub App manifest flow, paginated installation/repository discovery, short-lived installation tokens, signed/deduplicated webhooks and LAN reconciliation.
- Durable deployment queue with superseding/cancellation state, exact-commit Git worktrees and mandatory locked Nix flakes.
- Detached application process groups, Linux start-time/cmdline/command-hash identity checks, conservative non-Linux recovery and guarded group signalling.
- Candidate health checks, atomic route activation, current healthy release preservation and control-plane restart recovery.
- Stable per-application LAN ports plus multiple normalized custom domains, host-based HTTP routing and provider-neutral DNS/TLS support.
- Optional multi-zone Cloudflare DNS/Tunnel synchronization.
- File-backed live logs with bounded active/inactive retention.
- Verified, checksummed SQLite/application-data backup and rollback-safe restore commands.
- Locked pnpm and Nix inputs, reproducible Nix dependency hash, CI security/audit/license gates and packaged operational commands.

## Validation completed on x86_64 Linux

The following passed on 2026-07-24:

```text
pnpm biome:ci
pnpm typecheck
pnpm test                         # 7 files, 19 tests
pnpm build
pnpm test:e2e                    # production server, Chromium, 1 scenario
pnpm db:doctor                   # integrity ok, WAL, no FK violations, migrations exact
pnpm security:check              # private modes and tracked-secret scan
pnpm audit --prod --audit-level high
pnpm licenses list --prod
pnpm test:deployment
nix flake check --print-build-logs
nix build --print-build-logs
nix flake check ./examples/hello-nixhost
nix build ./examples/hello-nixhost
```

The real-Nix deployment integration verified healthy activation, a failing candidate preserving the active release, rapid-queue superseding, recovery of the same detached process after control-plane restart, child process-group shutdown and stable-port unavailability after stop. The built `result/bin/nixhost` artifact was also started with an empty isolated data directory; all migrations ran, `/api/health`, `/setup` and a traced Next.js CSS asset were served before a clean SIGINT shutdown.

Backup tests perform a real SQLite/application-data CLI round trip and reject a checksum-tampered archive before mutating current state. Browser tests verify first-run owner creation, setup-token invalidation, session cookies, hostile-origin rejection, user creation, viewer login and viewer write denial.

The dependency audit originally identified high-severity `sharp`/libvips and PostCSS advisories in Next.js transitive dependencies. Exact pnpm overrides now resolve `sharp 0.35.0` and `postcss 8.5.12`; the repeated production audit reports no known vulnerabilities.

## External and platform evidence still required

- GitHub live-account authorization, selected-repository install, private clone, LAN reconciliation and public webhook delivery are pending the owner’s test-account action.
- Cloudflare live zone/tunnel, Access policy, reconnect and token-handling tests have not been run against an account.
- No native `aarch64-linux`, Darwin or physical Android build was executed. Cross-platform packages in the dependency store are not evidence that those targets work.
- The required two-OEM physical Android matrix, Nix-on-Droid lifecycle checks and Maestro browser flows remain unexecuted.
- The plug-and-play standalone APK is a roadmap requirement; no APK or Android foreground-service adapter exists yet.
- Deployment fixtures still needed for never-bind, immediate-exit worker, sustained high-volume logs, missing lock, wrong-system output, build-time restart, explicit cancellation and forced-termination SQLite consistency.
- Backup/log validation still needs injected disk-full/interrupted-write tests and a documented cross-node restore exercise.

## Release assessment

The x86_64 Linux source and Nix package are a validated local candidate, but the project is **not yet generally release-ready**. Live GitHub/Cloudflare account checks, the remaining failure fixtures and physical ARM64 Android/Maestro gates above are mandatory before making that claim. Android cannot be called production-ready until the recorded device matrix passes.
