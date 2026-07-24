# Android and Nix-on-Droid

## What works

On a supported 64-bit ARM Android device, Nix-on-Droid can provide Nix, Node.js, Git and cloudflared in user space. NixHost can run as a LAN web service and supervise compatible `aarch64-linux` flake applications.

## What it is not

- not NixOS;
- not a VM;
- not Docker;
- not a kernel or permission escape;
- not safe multi-tenant hosting;
- not an uptime-guaranteed VPS.

## Android lifecycle constraints

- Acquire the Nix-on-Droid/Termux wake lock while hosting.
- Exempt the application from battery optimization where the device permits.
- OEM task killers may still stop it.
- Android Force stop cannot be automatically recovered until the user opens the app again.
- Memory-intensive Nix builds may be killed.
- Reboot restoration requires Nix-on-Droid boot integration or a future native Android foreground-service wrapper.

## Initial installation approach

1. Install a trusted current Nix-on-Droid build.
2. Complete its Nix bootstrap.
3. Clone this repository and enter its locked `nix develop` shell.
4. Run `scripts/android/run-nix-on-droid.sh verify` to validate the package and capture evidence.
5. Start NixHost with a wake lock. The test-only `serve-ci` mode is loopback-only and exists solely for Maestro acceptance.
6. Open the displayed LAN address from another device.
7. From an attached Android controller, run `scripts/android/run-maestro.sh first-run-setup` with the required environment values.
8. Test screen-off, network switching, control-plane restart and reboot and retain the generated `artifacts/android/` evidence.

## Production Android direction

A later integrated application should own:

- foreground service and persistent notification;
- wake lock;
- boot receiver within current Android policy;
- Android Keystore-wrapped encryption key;
- local status/recovery activity;
- Nix bootstrap and signed updates.

The Next.js control plane remains unchanged and is started by this native lifecycle wrapper.

The native wrapper, APK project, signing material, packaged binaries and release channels will live in a separate Android distribution repository. This repository owns the control plane, Nix-on-Droid validation scripts, Maestro browser flows and network contract only; it does not produce or ship an APK.
