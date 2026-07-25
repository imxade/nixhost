# NixHost Specification

This file is the compact implementation contract. Detailed rationale and operational guidance live under `docs/`.

## Product boundary

NixHost is a LAN-first personal application host. It runs as one persistent self-hosted Next.js and TypeScript control plane on a Nix-capable host, with Android through Nix-on-Droid as the first target. It is not a VPS, virtual machine, container runtime, NixOS installation, or multi-tenant sandbox.

Only trusted GitHub repositories are accepted. Every production deployment requires `flake.nix`, `flake.lock`, and a runnable `apps.<system>.<name>` output. A project may keep its production package in `nixhost.nix`, but the locked flake remains the only discovery and execution entry point. The normal deployment path never accepts arbitrary dashboard shell commands.

## Required behavior

1. A one-time terminal token claims a new node and creates the owner account.
2. Every dashboard/API operation requires an authenticated role after setup.
3. GitHub is connected from the dashboard through a per-node GitHub App
   manifest flow. LAN manifests use an inactive reserved public hook URL because
   GitHub rejects both blank and private hook URLs, subscribe only to `push`,
   and synchronize installation repository selections on the setup return.
4. The Applications page offers GitHub connection directly. After installation,
   the user searches the complete paginated repository set available to every
   active App installation and selects a flake app output. Repositories not
   granted to the GitHub App remain inaccessible. An omitted branch resolves
   from the remote symbolic `HEAD`, with `main` used only when no symbolic
   default is advertised.
5. Push webhooks deploy the exact production-branch commit when the node is public.
6. Periodic branch reconciliation catches pushes missed while the node was LAN-only or offline.
7. Candidate releases receive private local ports; web apps retain stable LAN proxy ports.
8. The current healthy release remains routed until the candidate passes readiness/health checks.
9. Application processes run in detached POSIX process groups and write to file-backed logs.
10. Desired application state, queue state, users, sessions, integrations, and history persist in SQLite.
11. Secrets are encrypted at rest and existing secret values are never returned by APIs.
12. Host and per-application resource data are shown without claiming exact OOM causality when evidence is insufficient.
13. Cloudflare Tunnel remains optional and can expose selected applications or the dashboard later.
14. Restart recovery must preserve running application processes where the host permits it.
15. Web applications may have multiple normalized custom domains. DNS and TLS may be managed by Cloudflare or by another provider targeting the application's stable LAN port.
16. Failed password checks are bounded in one-hour windows by source and username, and throttled responses provide retry timing.
17. Every project hostname exposes a persisted Cloudflare route result: managed, external, pending/not configured, or failed.
18. Cloudflare credentials are stored only after token activity,
    account/zone ownership and tunnel-list access are verified.
19. Authenticated application, user, integration and settings flows remain
    operable without horizontal overflow on phone, tablet and desktop screens.

## Android distribution tracks

The current Android track runs NixHost through Nix-on-Droid. It is not release-validated until the complete host and dashboard flow passes on physical ARM64 Android devices. Device acceptance combines command-level Nix-on-Droid checks with Maestro automation of the Android browser UI, including setup, authentication, GitHub connection, application creation, deployment status, LAN access and session expiry.

The future distribution target is a self-contained APK with no separate Nix-on-Droid installation or terminal setup. The APK must start and supervise the local control plane through an Android foreground-service platform adapter, open an embedded or system web interface for first-run configuration, preserve the existing Next.js/TypeScript control plane and Nix flake deployment contract, and surface lifecycle failures honestly. It must package or safely provision every required runtime component, satisfy Android packaging and licensing requirements, and pass the same physical-device gate before release. APK source, native wrapper code, signing, binaries and store distribution are out of scope for this repository and will live in a separate Android distribution repository.

Both tracks retain the same network contract: authenticated local access over LAN, with optional authenticated Cloudflare exposure. An APK must not weaken NixHost roles, sessions, origin validation, GitHub permissions or Cloudflare Access guidance.

## Application runtime contract

A runnable flake app must remain in the foreground and accept injected operational variables:

```text
NIXHOST=1
APP_ID
APP_NAME
DEPLOYMENT_ID
RELEASE_DIR
DATA_DIR
CACHE_DIR
LOG_DIR
HOST=127.0.0.1       # web only
PORT=<private port>   # web only
```

Mutable application data belongs under `DATA_DIR`. Applications may not assume root, systemd, Docker, KVM, privileged ports, kernel modules, or unavailable CPU architectures.

## Initial supported repository source

Accepted fallback URL form:

```text
https://github.com/<owner>/<repository>[.git]
```

Credentials embedded in URLs, query strings, fragments, alternate hosts, local paths, SSH URLs, and arbitrary remote Git servers are rejected. Private repositories use short-lived GitHub App installation tokens.

## Safety and trust

A flake can execute arbitrary evaluation, build, and runtime code as the NixHost OS account. Nix reproducibility is not workload isolation. Only the node owner’s trusted repositories may be deployed.

## Source of truth

Verified source and tests are authoritative for implemented behavior. When docs disagree with verified code, establish actual behavior from code/tests and update stale documentation in the same change.
