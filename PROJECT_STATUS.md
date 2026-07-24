# Implementation Status

Last updated: 2026-07-24.

## Implemented

- Next.js App Router dashboard, strict TypeScript APIs and one persistent custom server/runtime.
- One-time owner claim, authenticated sessions, login throttling, role enforcement and user management.
- Fixed one-hour password-failure limits: six per source/username and 30 per source, with `Retry-After` on throttled responses.
- SQLite WAL state with forward-only, empty-database-tested migrations and encrypted stored secrets.
- Locked GitHub App manifest flow, paginated installation/repository discovery, short-lived installation tokens, signed/deduplicated webhooks and LAN reconciliation.
- Omitted production branches resolve from the repository's symbolic remote `HEAD`, with a validated `main` fallback when no symbolic branch is advertised.
- Durable deployment queue with superseding/cancellation state, exact-commit Git worktrees and mandatory locked Nix flakes.
- Detached application process groups, Linux start-time/cmdline/command-hash identity checks, conservative non-Linux recovery and guarded group signalling.
- Candidate health checks, atomic route activation, current healthy release preservation and control-plane restart recovery.
- Stable per-application LAN ports plus multiple normalized custom domains, host-based HTTP routing and provider-neutral DNS/TLS support.
- Optional multi-zone Cloudflare DNS/Tunnel synchronization, per-project route status and ownership-checked cleanup of removed managed records.
- File-backed live logs with bounded active/inactive retention.
- Verified, checksummed SQLite/application-data backup and rollback-safe restore commands.
- Locked pnpm and Nix inputs, reproducible Nix dependency hash, CI security/audit/license gates and packaged operational commands.
- A separate production `nixhost.nix` package definition behind the locked flake contract, plus directly deployed `hello-nixhost` and npm-start examples.
- Guarded Nix-on-Droid and Maestro acceptance scripts plus a manually dispatched physical-runner workflow that retains evidence and rejects emulators.
- Apache-2.0 licensing with Rituraj Basak recorded as the owner.

## Validation completed on x86_64 Linux

The following passed on 2026-07-24:

```text
pnpm biome:ci
pnpm typecheck
pnpm test                         # 10 files, 36 tests
pnpm build
pnpm test:e2e                    # two isolated servers, Chromium, 2 scenarios
pnpm test:examples               # both checked-in examples, exact commits
pnpm test:deployment
pnpm db:doctor                   # integrity ok, WAL, no FK violations, 5 migrations exact
pnpm security:check              # private modes and tracked-secret scan
pnpm audit --prod --audit-level high
pnpm licenses list --prod
nix flake check --print-build-logs
nix build --print-build-logs
nix flake check ./examples/hello-nixhost
nix build ./examples/hello-nixhost
nix flake check ./examples/npm-start-nixhost
nix build ./examples/npm-start-nixhost
```

The direct-example harness copied each example into the root of its own Git repository and deployed it through the production engine without using the frontend. Both the minimal server and the npm `start` application activated at their exact commits, passed real health checks, returned through stable proxy ports and had their process groups stopped.

The real-Nix deployment integration verified healthy activation, a failing candidate preserving the active release, rapid-queue superseding, recovery of the same detached process after control-plane restart, child process-group shutdown and stable-port unavailability after stop. The current Apache-licensed `result/bin/nixhost` artifact was also started with an empty isolated data directory; all five migrations ran, `/api/health`, `/api/setup/status`, `/setup` and a traced Next.js CSS asset were served before a clean SIGINT shutdown.

Backup tests perform a real SQLite/application-data CLI round trip and reject a checksum-tampered archive before mutating current state. Browser tests verify first-run owner creation, setup-token invalidation, theme initialization before body rendering, persisted theme choice, responsive form alignment, session cookies, hostile-origin rejection, user creation, viewer login, viewer write denial, the separate CI admin and hourly throttle timing.

The Cloudflare unit integration verifies managed and external per-project states, remote ingress construction, removal of stale NixHost-owned DNS, and preservation of records whose target or ownership comment does not match. It uses a deterministic mocked Cloudflare API; it is not a live-account result.

The dependency audit originally identified high-severity `sharp`/libvips and PostCSS advisories in Next.js transitive dependencies. Exact pnpm overrides now resolve `sharp 0.35.0` and `postcss 8.5.18`; the repeated production audit reports no known vulnerabilities.

## External and platform evidence still required

- GitHub live-account authorization, selected-repository install, private clone, LAN reconciliation and public webhook delivery are pending the owner’s test-account action.
- Cloudflare live zone/tunnel, Access policy, reconnect and token-handling tests have not been run against an account.
- No native `aarch64-linux`, Darwin or physical Android build was executed. Cross-platform packages in the dependency store are not evidence that those targets work.
- Android preflight found only an Android 15 x86_64 emulator, no Nix-on-Droid installation on it and no Maestro CLI. The acceptance guard rejected that environment as intended; the required two-OEM physical ARM64 matrix, Nix-on-Droid lifecycle checks and Maestro browser flows remain unexecuted.
- The plug-and-play standalone APK is a roadmap requirement for a separate Android distribution repository; no APK, signing pipeline or Android foreground-service adapter exists here.
- Deployment fixtures still needed for never-bind, immediate-exit worker, sustained high-volume logs, missing lock, wrong-system output, build-time restart, explicit cancellation and forced-termination SQLite consistency.
- Backup/log validation still needs injected disk-full/interrupted-write tests and a documented cross-node restore exercise.

## Release assessment

The x86_64 Linux source and Nix package are a validated local release candidate, but the project is **not yet generally release-ready**. Live GitHub/Cloudflare account checks, the remaining failure fixtures, native target coverage and physical ARM64 Android/Maestro gates above are mandatory before making that claim. `LOCAL_AGENT_PROMPT.md` therefore remains as the unfinished acceptance checklist. Android cannot be called production-ready until the recorded device matrix passes.
