# Architecture

## Topology

```text
LAN browser
    |
    v
custom Node HTTP server + Next.js App Router
    |-- dashboard, auth, APIs, SSE
    |-- SQLite and encrypted local state
    |-- deployment scheduler
    |-- process supervisor
    |-- metrics collector
    |-- GitHub reconciler
    |-- provider-neutral routing
    |-- Cloudflare Quick/named tunnel controller
    |   `-- optional OAuth provider (feature-gated module)
    |-- per-app LAN proxy listeners
    |
    +--> git
    +--> nix
    +--> cloudflared Quick Tunnels (default; optional via configuration)
    +--> cloudflared named tunnel (optional custom domains)
    +--> detached flake application process groups
```

The product is a single TypeScript codebase and one main control-plane process. Deployed applications are necessarily separate processes produced by their own flakes.

## Why a custom Next.js server

The selected product constraint is “Next.js completely.” A custom Node HTTP server allows the same codebase to own a persistent lifecycle and graceful shutdown while Next.js continues to serve the dashboard and Route Handlers. This gives up Next.js standalone output; the package includes the normal production build and runtime dependencies instead.

## Boot sequence

1. Validate environment configuration.
2. Create private data directories.
3. Acquire the exclusive runtime lock.
4. Open SQLite and transactionally apply migrations.
5. Create or recover the one-time setup token.
6. Mark incomplete deployments interrupted.
7. Recreate stable per-app LAN proxy listeners.
8. Reconcile active application process IDs.
9. Start metrics, Git reconciliation and deployment scheduling loops.
10. Start account-free Quick Tunnels by default and the named Cloudflare tunnel
    when configured and enabled.
11. Prepare Next.js and listen on the LAN interface.

The runtime is also guarded on `globalThis` to avoid duplicate initialization from Next.js development reloads or instrumentation.

## Persistent state

```text
$NIXHOST_DATA_DIR/
  nixhost.sqlite
  repositories/       bare Git mirrors
  releases/           immutable worktrees per deployment
  applications/<id>/  persistent data and caches
  logs/<id>/           deployment stdout/stderr
  secrets/            host encryption key fallback
  runtime/            lock and first-run token
  backups/
```

The Nix store and release worktrees are replaceable. Application state is separate and passed as `DATA_DIR`.

## Deployment state machine

```text
queued -> preparing -> fetching -> evaluating -> starting
       -> health-checking -> activating -> running
       -> failed | cancelled | superseded | interrupted
```

Claiming a queued record and moving it to `preparing` occurs transactionally. A newer queued deployment supersedes older queued deployments for the same application.

## Safe activation

- Existing healthy release remains routed.
- Candidate gets a new private local port.
- Candidate is launched in a new POSIX session/process group.
- NixHost checks the configured HTTP health path.
- SQLite activation and active-port switch are atomic.
- Stable LAN proxy immediately routes to the candidate.
- Old process group is then terminated.

Workers are required to stay alive for a startup stability window rather than expose an HTTP health endpoint.

## Process recovery

Application output goes directly to files instead of Node pipes. Detached process groups can continue after a control-plane failure. Linux recovery records and verifies PID, process-group ID, `/proc/<pid>/stat` start ticks, and a SHA-256 digest of the command identity before treating a recovered process as owned or signalling its process group. A mismatched or incomplete identity is treated as disappeared.

## LAN routing

Each web app receives:

- private candidate port, changed per deployment;
- stable public LAN proxy port, retained for the application lifetime.

The built-in Node HTTP proxy supports ordinary HTTP and WebSocket upgrades. It returns 503 while the application has no healthy active release.

Web applications can also own multiple normalized DNS hostnames. Ordinary HTTP requests on the dashboard listener are dispatched by `Host`; each app's stable port remains the provider-neutral origin for WebSockets and external DNS/TLS proxies.

Cloudflare synchronization persists one result per project hostname. The application Domains tab and the global Cloudflare page share that state, including managed/external/error status, zone, last error and synchronization time. Removal cleanup is ownership-checked before deleting a DNS record.

Cloudflare OAuth is deliberately outside the tunnel and DNS controller. The
stable facade dynamically loads `cloudflare-oauth-provider.ts` only when
`NIXHOST_CLOUDFLARE_OAUTH_ENABLED=true` and the complete client configuration is
present. Disabling that one switch leaves account-free Quick Tunnels and manual
API-token named tunnels intact.

## Scaling boundary

The initial host is one control-plane process and SQLite. It is designed for a personal node, not horizontal multi-node scheduling. A future central control plane must use a separate architecture and durable relay; it should not turn this SQLite node into a distributed database.
