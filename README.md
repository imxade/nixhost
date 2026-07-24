# NixHost

NixHost is a LAN-first, self-hosted deployment control plane built entirely with Next.js and TypeScript. It imports trusted GitHub repositories containing Nix flakes, runs their `apps.<system>` outputs, supervises the resulting processes, streams logs, assigns stable LAN ports, and optionally exposes selected services through Cloudflare Tunnel.

> NixHost does **not** turn Android into a virtual machine or a real VPS. On Android it is a personal application host running inside Nix-on-Droid and remains subject to Android, architecture, kernel, memory, battery, and background-process restrictions.

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
examples/hello-nixhost/  Minimal deployable flake example
server.ts                 Custom persistent Next.js server
instrumentation.ts        Runtime boot hook for standard Next.js paths
flake.nix                 Development and package definition
```

## Development start

Prerequisites: a working Nix installation, Node.js 24, pnpm, Git, and an ARM64 or x86-64 Linux/macOS host supported by the dependencies.

```bash
nix develop
pnpm install
pnpm dev
```

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

The delivered source intentionally does not include a fabricated `pnpm-lock.yaml`, `flake.lock`, or Nix fixed-output dependency hash. Generate and validate these locally using the exact dependency resolver and Nix revision, then commit them. See [`LOCAL_AGENT_PROMPT.md`](LOCAL_AGENT_PROMPT.md).

## Application flake contract

A web application must remain in the foreground and listen on `HOST` and `PORT`. Mutable state belongs under `DATA_DIR`.

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

AGPL-3.0-only. The complete GNU Affero General Public License v3 text is included in `LICENSE`.
