# Testing Strategy

## Automated checks

```bash
pnpm biome:ci
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:deployment
pnpm test:examples
pnpm test:github-public             # opt-in external push test
pnpm db:doctor
pnpm security:check
pnpm audit --prod --audit-level high
pnpm licenses list --prod
nix flake check
nix build
```

The current push/pull-request CI runs the application, browser, database,
security, audit, license, direct-example, real-deployment and Nix package gates
on x86_64 Linux.

Release CI expansion still required:

- x86_64 Linux, Node 24;
- aarch64 Linux through native runner or QEMU for compile-only checks;
- macOS ARM64 for portability checks;
- Nix `flake check` and package build;
- dependency audit and secret scan.

The browser suite starts two isolated loopback servers. The normal production
command covers one-time owner setup, session authentication, cross-origin
mutation rejection, user creation, and viewer role enforcement. The separate
`pnpm start:ci` command provisions the explicit test-only admin
`qwerty123456` / `qwerty123456`; its browser scenario verifies admin login and
the hourly authentication limit including `Retry-After`.

Authenticated dashboard routes are also exercised at `320x568`, `768x1024`,
and `1440x900`. The suite checks the applications, users, GitHub, Cloudflare,
settings, and new-application screens for horizontal overflow and requires
exactly one visible theme control at each size.

`pnpm test:examples` bypasses the dashboard and deploys each tracked example
through the real deployment engine. The harness copies each example into the
root of an isolated Git repository, deploys its exact commit, waits for its real
health endpoint, verifies the stable proxy response, and stops its process group.

`pnpm test:github-public` is a separate opt-in external test. It requires a
dedicated repository URL and `NIXHOST_PUBLIC_TEST_PUSH=1`, pushes a marker
commit, then proves that production reconciliation deploys that exact commit,
keeps the stable proxy healthy, and supersedes the old release. It must never be
pointed at a repository whose history should remain untouched.

## Deployment fixtures

Test with repositories that represent:

- healthy web app;
- web app that never binds to PORT;
- health endpoint that returns 500;
- worker that exits immediately;
- app spawning child workers;
- app producing high-volume stdout/stderr;
- invalid/missing flake lock;
- flake missing current-system output;
- private GitHub repository;
- several rapid pushes;
- control-plane restart during build and while app is running.

These process/deployment cases require real Nix builds and process groups; they must not be replaced by fake success fixtures.

## Real Android gate

No Android production claim is allowed until all Phase 0 tests in the PRD pass on at least two physical ARM64 devices from different OEMs. Record Android version, Nix-on-Droid version, Nix version, device memory, battery settings and exact failures.

For the current Nix-on-Droid distribution:

1. Install and update Nix-on-Droid without granting root access.
2. Run the locked install, typecheck, unit, production build, database doctor, security check, flake check and package build commands where the device supports them.
3. Start the packaged control plane and deploy `examples/hello-nixhost`.
4. Run version-controlled Maestro flows against the Android browser for first-run setup, login/logout, role restrictions, GitHub authorization handoff, application creation, deployment and error states.
5. Verify access from a second LAN device and through an authenticated temporary Cloudflare hostname.
6. Exercise screen-off/wake-lock, Wi-Fi loss and recovery, Wi-Fi/mobile switching, process crash, device reboot, memory pressure, OEM battery killing and explicit Force stop.

Maestro results complement rather than replace command logs, process checks and a second-device network test. Record the Maestro and Nix-on-Droid versions, flow files, timestamps, screenshots and any device-specific exclusions. Never convert an unsupported kernel or architecture case into a passing fixture.

The future standalone APK repeats the same suite with no Nix-on-Droid or terminal precondition. Its Maestro flows must begin at fresh APK installation, cover guided configuration and verify that starting the app starts or reconnects to the foreground control-plane service and opens the web interface. Upgrade, permission denial, notification/foreground-service disclosure, backup/restore and uninstall/reinstall behavior are additional APK release gates.

The checked-in Android harness consists of:

```text
scripts/android/run-nix-on-droid.sh verify
scripts/android/run-nix-on-droid.sh serve-ci
scripts/android/run-maestro.sh ci-login
scripts/android/run-maestro.sh first-run-setup
.github/workflows/android-device.yml
nix develop .#android
```

The manually dispatched workflow deliberately requires labeled self-hosted
physical-device runners, obtains its host tools from `nix develop .#android`,
and uploads `artifacts/android/` even when a gate fails. Physical mode rejects
non-ARM64 Nix-on-Droid hosts and Android emulators. A separately named
development-emulator mode is available for browser-flow iteration and always
marks its result as non-release evidence.

On 2026-07-24, the locked Android shell supplied Maestro 2.6.1, ADB 36.0.1,
OpenJDK 21.0.12, curl 8.21.0, and yq 4.53.3. The CI login flow passed in Chrome
on an Android 15 x86_64 development emulator against the loopback-only host
server. The Nix-on-Droid verifier correctly rejected that x86_64 emulator.
This is useful UI-development evidence, not Android compatibility or release
evidence; no physical-device pass is recorded.

APK implementation and distribution remain outside this repository. The future Android distribution repository must consume these acceptance requirements and provide its own fresh-install Maestro flows, native unit/instrumentation tests, signing/reproducibility evidence and release artifacts.

## Quality-tooling rule

Biome is the only formatter and linter. ESLint, Prettier, and framework-generated ESLint configuration must not be introduced. CI must run `pnpm biome:ci` before type checking and tests.
