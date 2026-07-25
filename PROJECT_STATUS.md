# Implementation Status

Last updated: 2026-07-25.

## Implemented

- Next.js App Router dashboard, strict TypeScript APIs and one persistent custom server/runtime.
- One-time owner claim, authenticated sessions, login throttling, role enforcement and user management.
- Fixed one-hour password-failure limits: six per source/username and 30 per source, with `Retry-After` on throttled responses.
- SQLite WAL state with forward-only, empty-database-tested migrations and encrypted stored secrets.
- Locked GitHub App manifest flow with an inactive, schema-valid LAN hook, push-only
  subscriptions, repository-selection return synchronization, paginated
  installation/repository discovery, short-lived installation tokens,
  signed/deduplicated public webhooks and LAN reconciliation.
- Omitted production branches resolve from the repository's symbolic remote `HEAD`, with a validated `main` fallback when no symbolic branch is advertised.
- Durable deployment queue with superseding/cancellation state, exact-commit Git worktrees and mandatory locked Nix flakes.
- Detached application process groups, Linux start-time/cmdline/command-hash identity checks, conservative non-Linux recovery and guarded group signalling.
- Candidate health checks, atomic route activation, current healthy release preservation and control-plane restart recovery.
- Stable per-application LAN ports plus multiple normalized custom domains, host-based HTTP routing and provider-neutral DNS/TLS support.
- Optional multi-zone Cloudflare DNS/Tunnel synchronization, public-client
  OAuth with PKCE/single-use state/encrypted refresh tokens, account/zone
  discovery, manual-token fallback, pre-save account/zone/tunnel-access
  verification, per-project route status and ownership-checked cleanup of
  removed managed records.
- File-backed live logs with bounded active/inactive retention.
- Verified, checksummed SQLite/application-data backup and rollback-safe restore commands.
- Locked pnpm and Nix inputs, reproducible Nix dependency hash, CI security/audit/license gates and packaged operational commands.
- A separate production `nixhost.nix` package definition behind the locked flake contract, plus directly deployed `hello-nixhost` and npm-start examples.
- A reproducible Android controller shell with Maestro/ADB/Java plus guarded
  Nix-on-Droid and Maestro acceptance scripts and a manually dispatched
  physical-runner workflow that retains evidence.
- Responsive dashboard coverage across phone, tablet and desktop viewports.
- Opt-in public-GitHub acceptance automation that pushes a real commit and
  proves exact-commit healthy redeployment through the stable proxy.
- Apache-2.0 licensing with Rituraj Basak recorded as the owner.

## Validation completed on x86_64 Linux

The following passed on 2026-07-25:

```text
pnpm biome:ci
pnpm typecheck
pnpm test                         # 13 files, 46 tests
pnpm build
pnpm test:e2e                    # two isolated servers, Chromium, 2 scenarios
pnpm test:examples               # both checked-in examples, exact commits
pnpm test:deployment
pnpm db:doctor                   # integrity ok, WAL, no FK violations, 6 migrations exact
pnpm security:check              # private modes and tracked-secret scan
pnpm audit --prod --audit-level high
pnpm licenses list --prod
nix flake check --print-build-logs
nix build --print-build-logs
nix flake check ./examples/hello-nixhost
nix build ./examples/hello-nixhost
nix flake check ./examples/npm-start-nixhost
nix build ./examples/npm-start-nixhost
NIXHOST_PUBLIC_TEST_REPOSITORY_URL=https://github.com/imxade/nixhost-deployment-test.git \
  NIXHOST_PUBLIC_TEST_PUSH=1 pnpm test:github-public
NIXHOST_MAESTRO_ORIGIN=host ANDROID_SERIAL=emulator-5554 \
  nix develop .#android --command scripts/android/run-maestro.sh ci-login development-emulator
```

The direct-example harness copied each example into the root of its own Git repository and deployed it through the production engine without using the frontend. Both the minimal server and the npm `start` application activated at their exact commits, passed real health checks, returned through stable proxy ports and had their process groups stopped.

The real-Nix deployment integration verified healthy activation, a failing candidate preserving the active release, rapid-queue superseding, recovery of the same detached process after control-plane restart, child process-group shutdown and stable-port unavailability after stop. The current Apache-licensed `result/bin/nixhost` artifact was also started with an empty isolated data directory; all five migrations ran, `/api/health`, `/api/setup/status`, `/setup` and a traced Next.js CSS asset were served before a clean SIGINT shutdown.

Backup tests perform a real SQLite/application-data CLI round trip and reject a
checksum-tampered archive before mutating current state. Browser tests verify
first-run owner creation, setup-token invalidation, theme initialization before
body rendering, persisted theme choice, responsive alignment and absence of
overflow across authenticated routes at phone, tablet, and desktop sizes,
session cookies, hostile-origin rejection, user creation, viewer login, viewer
write denial, the separate CI admin and hourly throttle timing.

The Cloudflare unit integration verifies PKCE/scopes, one-time callback state,
refresh-token rotation, candidate rollback, managed and external per-project
states, remote ingress construction, removal of stale NixHost-owned DNS, and
preservation of records whose target or ownership comment does not match. It
uses a deterministic mocked Cloudflare API; it is not a live-account result.

Git reconciliation now records every observed commit, including failed
deployments, so branch polling cannot continuously retry the same broken
revision. A manual redeploy can retry a transient host failure; a repository
fix arrives as a new commit and remains automatically deployable.

GitHub manifest tests verify that LAN-only registration supplies GitHub's
required hook URL using an inactive reserved public sentinel, requests only the
supported push event, and enables installation setup returns. A configured
`NIXHOST_PUBLIC_URL` supplies and activates the real public webhook origin.

The public fixture
`https://github.com/imxade/nixhost-deployment-test.git` uses `trunk` as remote
HEAD. The acceptance test deployed
`9a5657d96856555daec8dae6e4ec644f16f39ea7`, pushed
`cf80d75d88578fc9af547acf281444eb95642005`, reconciled it, activated that exact
revision through the healthy stable proxy, and superseded the previous release.

The Android development shell evaluated for `x86_64-linux`, `aarch64-linux`,
and `aarch64-darwin`. Its Maestro 2.6.1 CI login flow passed on an Android 15
x86_64 development emulator and recorded non-release evidence. The
Nix-on-Droid runner correctly rejected that non-ARM64 device.

The dependency audit originally identified high-severity `sharp`/libvips and PostCSS advisories in Next.js transitive dependencies. Exact pnpm overrides now resolve `sharp 0.35.0` and `postcss 8.5.18`; the repeated production audit reports no known vulnerabilities.

## External and platform evidence still required

- GitHub live-account authorization, selected-repository install, private clone
  and signed public webhook delivery are pending the owner’s test-account
  action. Public-repository branch reconciliation and push redeployment have
  passed.
- Cloudflare live OAuth consent, zone/tunnel, Access policy, reconnect,
  refresh-token and custom-domain lifecycle tests have not been run against an
  account. Unit and browser coverage use deterministic mocked Cloudflare
  responses and cannot replace that evidence.
- No native `aarch64-linux`, Darwin or physical Android build was executed. Cross-platform packages in the dependency store are not evidence that those targets work.
- Android development automation passed its browser flow on an Android 15
  x86_64 emulator using the locked Maestro shell, while the Nix-on-Droid
  acceptance guard rejected that architecture as intended. The required
  two-OEM physical ARM64 matrix, Nix-on-Droid lifecycle checks and physical
  Maestro browser flows remain unexecuted.
- The plug-and-play standalone APK is a roadmap requirement for a separate Android distribution repository; no APK, signing pipeline or Android foreground-service adapter exists here.
- Deployment fixtures still needed for never-bind, immediate-exit worker, sustained high-volume logs, missing lock, wrong-system output, build-time restart, explicit cancellation and forced-termination SQLite consistency.
- Backup/log validation still needs injected disk-full/interrupted-write tests and a documented cross-node restore exercise.

## Release assessment

The x86_64 Linux source and Nix package are a validated local release candidate, but the project is **not yet generally release-ready**. Live GitHub/Cloudflare account checks, the remaining failure fixtures, native target coverage and physical ARM64 Android/Maestro gates above are mandatory before making that claim. `LOCAL_AGENT_PROMPT.md` therefore remains as the unfinished acceptance checklist. Android cannot be called production-ready until the recorded device matrix passes.
