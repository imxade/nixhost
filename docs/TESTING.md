# Testing Strategy

## Automated checks

```bash
pnpm biome:ci
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm db:doctor
pnpm security:check
nix flake check
nix build
```

Required CI matrix after lock generation:

- x86_64 Linux, Node 24;
- aarch64 Linux through native runner or QEMU for compile-only checks;
- macOS ARM64 for portability checks;
- Nix `flake check` and package build;
- dependency audit and secret scan.

The production browser suite starts with an isolated data directory and covers one-time owner setup, session authentication, cross-origin mutation rejection, user creation, and viewer role enforcement.

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

## Quality-tooling rule

Biome is the only formatter and linter. ESLint, Prettier, and framework-generated ESLint configuration must not be introduced. CI must run `pnpm biome:ci` before type checking and tests.
