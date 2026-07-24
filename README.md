# NixHost

NixHost is a LAN-first, self-hosted, VPS-like application host and deployment control plane built entirely with Next.js and TypeScript. It imports trusted GitHub repositories containing Nix flakes, runs their `apps.<system>` outputs, supervises the resulting processes, streams logs, assigns stable LAN ports and custom domains, and optionally exposes selected services through Cloudflare Tunnel.

This is not merely “Vercel for Android.” A `flake.nix` can package far more than a web frontend: APIs, workers, bots, schedulers, language runtimes, databases intended for a trusted single-user host, and other long-running foreground services can all use the same GitHub auto-deployment pipeline.

> “VPS-like” describes the general-purpose application-hosting experience, not an isolation claim. NixHost does **not** turn Android into a virtual machine or a real VPS. Flakes provide reproducible software and commands, but cannot add missing kernel capabilities or bypass Android architecture, memory, battery, force-stop, and background-process restrictions. All deployed repositories run as the NixHost account and must be trusted.

Today, Android development and physical-device validation use Nix-on-Droid. The distribution roadmap is a plug-and-play APK: install it, open it, and configure NixHost through the automatically started web interface without separate terminal setup. The APK, its native foreground-service wrapper, and Android distribution artifacts deliberately belong in a separate future repository; they are not part of this repository. That distribution must pass the Maestro, multi-device, foreground-service, packaging and licensing gates in [`docs/TESTING.md`](docs/TESTING.md). LAN access and optional Cloudflare exposure will keep the same NixHost authentication model.

## Current product contract

- One long-running self-hosted Next.js control plane.
- Android/Nix-on-Droid first; portable to other Nix-capable systems.
- LAN access at `http://<device-ip>:3000` after login.
- GitHub App creation and repository selection from the dashboard.
- Automatic deployment after a push when a public webhook is configured.
- Periodic branch reconciliation when the host is LAN-only or was offline.
- Repositories must contain `flake.nix` and `flake.lock`.
- Preferred runnable output: `apps.<system>.default`.
- Stable per-application LAN ports with health-checked release switching.
- Up to 20 normalized custom domains per web application, unique across the node.
- Host-based HTTP routing on the dashboard listener and stable per-app ports for any DNS/TLS provider.
- Multi-zone Cloudflare DNS and Tunnel synchronization for domains managed by the configured token.
- Persistent SQLite state, encrypted secrets, deployment history, live logs, resource sampling, process restart and recovery.
- Optional Cloudflare Tunnel configured later from the dashboard.

## Stack

- Next.js App Router and React
- TypeScript strict mode
- Node.js 24 LTS target
- Tailwind CSS and daisyUI
- SQLite through `better-sqlite3`
- Zod validation
- Server-Sent Events
- Native Node HTTP proxy and process supervision
- Nix, Git and cloudflared as managed executables
- Biome for formatting, linting, and import organization; no ESLint
- Vitest and Playwright

## Repository layout

```text
src/app/                 Next.js pages and API Route Handlers
src/components/          Dashboard client components
src/server/              Durable control-plane services
migrations/              Transactional SQLite migrations
scripts/                 Diagnostics and launch helpers
tests/                   Unit and browser tests
docs/                    Product, architecture and operations documentation
examples/hello-nixhost/      Minimal deployable flake example
examples/npm-start-nixhost/  npm-start application packaged for deployment
server.ts                 Custom persistent Next.js server
instrumentation.ts        Runtime boot hook for standard Next.js paths
flake.nix                 Locked Nix entry point and development shell
nixhost.nix               Production package definition
```

## Development start

Prerequisites: a working Nix installation and one of the flake's declared
systems: `x86_64-linux`, `aarch64-linux`, or `aarch64-darwin`. The default
development shell supplies Node.js 24, pnpm, Git, and the remaining host tools.
Only `x86_64-linux` has completed the full release matrix recorded in this
repository.

```bash
nix develop
pnpm install
pnpm dev
```

Android-device automation uses the separate reproducible tool shell:

```bash
nix develop .#android
```

It supplies Maestro, ADB, Java, curl, and yq without adding those tools to the
production closure.

Open `http://127.0.0.1:3000`. The first-run token is printed by the process and written to:

```text
$NIXHOST_DATA_DIR/setup-token.txt
```

The default data directory is `~/.local/share/nixhost` in production and can be changed through `NIXHOST_DATA_DIR`.

## Production start outside the Nix package

```bash
pnpm install --frozen-lockfile
pnpm biome:ci
pnpm typecheck
pnpm test
pnpm build
HOSTNAME=0.0.0.0 PORT=3000 pnpm start
```

The repository includes the resolved `pnpm-lock.yaml`, `flake.lock`, and Nix fixed-output dependency hash. Do not regenerate them casually; dependency updates must repeat the full validation gate in [`LOCAL_AGENT_PROMPT.md`](LOCAL_AGENT_PROMPT.md).

CI and local browser automation use a separate loopback-only command:

```bash
pnpm build
pnpm start:ci
```

It recreates only a guarded test-data directory and provisions the documented
test admin `qwerty123456` / `qwerty123456`. Never use this command for a LAN or
production node. `pnpm start` has no default credentials and always retains the
one-time owner-claim flow.

## Application flake contract

A web application must remain in the foreground and listen on `HOST` and `PORT`. Mutable state belongs under `DATA_DIR`.

`flake.nix` is the locked discovery entry point NixHost evaluates. Projects may
keep the actual deployment package in a separate `nixhost.nix` and expose it
from the flake, as both checked-in examples do.

```nix
apps.${system}.default = {
  type = "app";
  program = "${package}/bin/server";
};
```

NixHost starts it with:

```bash
nix run --no-write-lock-file .#default
```

See [`docs/DEPLOYMENT_CONTRACT.md`](docs/DEPLOYMENT_CONTRACT.md) and the example project.

## Public push-redeployment acceptance

The opt-in acceptance test clones a dedicated public GitHub repository, resolves
its default branch, deploys the exact initial revision, pushes a marker commit,
runs the same reconciliation path used by the server, and verifies that the new
exact revision replaces the healthy release:

```bash
gh auth setup-git
NIXHOST_PUBLIC_TEST_REPOSITORY_URL=https://github.com/imxade/nixhost-deployment-test.git \
NIXHOST_PUBLIC_TEST_PUSH=1 \
nix develop --command pnpm test:github-public
```

The test intentionally mutates the named remote and therefore requires both the
URL and explicit push acknowledgement. The fixture's default branch is `trunk`;
this also proves that an omitted production branch follows remote `HEAD` instead
of assuming `main`.

## Custom domains

Each web application can have multiple hostnames such as `api.example.com` and `www.example.net`.

- Cloudflare-managed zones available to the configured API token are synchronized automatically.
- Hostnames managed elsewhere are left untouched. Point them through your chosen DNS/TLS reverse proxy to the app's stable LAN port.
- Each application's Domains tab shows whether every hostname is Cloudflare-managed, externally managed, awaiting synchronization, or failed, together with the stable origin port and last synchronization result.
- Plain HTTP requests reaching the NixHost dashboard listener are also routed by `Host`.
- TLS termination remains the responsibility of Cloudflare or the external reverse proxy.

## Security warning

Every imported repository can execute arbitrary code with the same host account as NixHost. Nix flakes provide reproducibility, not a security boundary. Only deploy repositories you trust. NixHost is not a multi-tenant sandbox.

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment contract](docs/DEPLOYMENT_CONTRACT.md)
- [Security model](docs/SECURITY.md)
- [GitHub integration](docs/GITHUB.md)
- [Cloudflare integration](docs/CLOUDFLARE.md)
- [Android and Nix-on-Droid](docs/ANDROID.md)
- [Operations](docs/OPERATIONS.md)
- [Testing](docs/TESTING.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Implementation status](PROJECT_STATUS.md)

## License

Apache-2.0. Copyright 2026 Rituraj Basak. See `LICENSE` and `NOTICE`.
