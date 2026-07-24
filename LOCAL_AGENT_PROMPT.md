# Final local-agent prompt

You are completing and validating the NixHost repository on the user's actual machine. Work directly in this repository. Do not merely report suggestions: inspect, edit, run, test, and leave the repository in the strongest verifiable state possible.

## Product definition

NixHost is a LAN-first personal deployment platform implemented completely in Next.js and TypeScript. It runs as one persistent self-hosted Next.js control plane, imports trusted GitHub repositories containing `flake.nix` and `flake.lock`, executes selected `apps.<system>` outputs, supervises detached processes, streams logs, reports resources, assigns stable LAN proxy ports, auto-deploys production-branch pushes, and can optionally enable Cloudflare Tunnel later.

Android/Nix-on-Droid ARM64 is the first target, but the code must remain portable to supported Nix Linux/macOS hosts. Do not rewrite it into Go, Rust, Fastify, Express, Docker, systemd-only services, or a separate frontend/backend architecture.

## Non-negotiable architecture

- Next.js App Router, React, TypeScript strict mode.
- Custom persistent Node HTTP server in `server.ts`.
- SQLite through `better-sqlite3` unless actual ARM64 Nix-on-Droid testing proves it unworkable.
- Nix CLI, Git CLI and optional cloudflared are managed child executables.
- Repositories deploy through runnable flake app outputs; no arbitrary dashboard shell commands.
- Existing healthy release remains active until candidate health succeeds.
- Stable LAN per-app proxy port; candidate private port changes per deployment.
- GitHub push webhooks when public; branch reconciliation when LAN-only/offline.
- No fake success, disabled checks, fabricated benchmark, or hidden manual step.

## Work sequence

### 1. Inspect before editing

Read in this order:

1. `README.md`
2. `PROJECT_STATUS.md`
3. `docs/PRD.md`
4. `docs/ARCHITECTURE.md`
5. `docs/SECURITY.md`
6. `docs/DEPLOYMENT_CONTRACT.md`
7. all source, migrations, tests and `flake.nix`

Treat code and passing tests as the implementation truth. Update stale docs in the same change.

### 2. Establish the exact environment

Record:

```bash
uname -a
uname -m
node --version
pnpm --version
nix --version
nix eval --raw --impure --expr builtins.currentSystem
git --version
cloudflared --version || true
```

Use Node.js 24 LTS from the Nix development shell. Do not silently validate only with a different major version.

### 3. Resolve and lock dependencies

Run:

```bash
nix flake lock
nix develop
corepack enable
pnpm install
```

Commit the generated `flake.lock` and `pnpm-lock.yaml`.

Do not use `--no-frozen-lockfile` in CI after the initial lock exists. Verify every pinned package version actually exists and is mutually compatible. Update package versions only when needed for a real install/build/security issue, and document the reason.

### 4. Full static and application validation

Run repeatedly until clean:

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm db:doctor
pnpm security:check
```

Fix all errors at their source. Do not add broad `any`, `@ts-ignore`, disabled lint/type rules, skipped tests, or `|| true` to make checks pass.

Specifically inspect:

- Next.js 16 Route Handler and async params compatibility.
- Custom server production startup and asset paths.
- `instrumentation.ts` does not boot the runtime during `next build`.
- only one runtime singleton/lock is active.
- auth cookies are actually set on setup and login responses.
- role checks cover every write route.
- same-origin checks do not block legitimate browser mutations.
- SSE connections close cleanly.
- database migrations work from an empty directory and are idempotent.
- native `better-sqlite3` compiles and loads.
- Tailwind 4/daisyUI 5 CSS compiles.
- no Server Component imports browser-only code.

### 5. Harden process identity and recovery

The current implementation records PID/process-group ID. Improve it so recovered processes are verified against PID reuse before signalling or attaching:

- On Linux record process start time from `/proc/<pid>/stat` and expected executable/cmdline metadata.
- On recovery compare recorded identity with current process.
- Never kill a process based only on a stale PID.
- Preserve portability: unsupported platforms should use a conservative adapter and never pretend certainty.

Add unit/integration tests for this behavior.

### 6. Validate the deployment engine end to end on Linux first

Create temporary Git repositories/fixtures for:

- healthy HTTP app using `HOST`/`PORT`;
- app whose health endpoint returns 500;
- app that never binds;
- worker that exits immediately;
- app with child workers;
- high-volume stdout/stderr;
- missing `flake.lock`;
- wrong-system flake output;
- rapid consecutive deployments;
- cancellation;
- control-plane restart during build;
- control-plane restart while app runs;
- rollback/preservation of prior healthy release.

Verify that:

- the exact requested commit is checked out;
- no secrets appear in Git URLs or platform logs;
- old release remains routed on candidate failure;
- a successful activation changes routing atomically;
- all descendants terminate on stop/redeploy;
- logs keep flowing after control-plane restart;
- SQLite remains consistent after forced termination.

Add missing tests and fix implementation failures.

### 7. Validate and harden log retention and backup

The repository includes bounded inactive-log retention and CLI backup/restore. Test them under active writes, disk pressure, interrupted backup, missing encryption key, corrupt archive and cross-node restore. Fix any consistency issue, add regression tests, and document exactly what is and is not included. Never delete application persistent data as part of log cleanup or Nix garbage collection.

### 8. Validate GitHub integration with a test GitHub account

Using a non-sensitive test account and repository:

- Create the node-owned GitHub App through the manifest dashboard flow.
- Install it with selected-repository access.
- Verify repository listing and private clone.
- Confirm installation token expiry is handled by generating tokens only when needed.
- With LAN-only mode, push and verify reconciliation deploys the exact branch head.
- With a temporary stable HTTPS endpoint, verify SHA-256 webhook signatures, delivery dedupe, branch filtering, exact commit deployment and missed-webhook recovery.
- Verify installation and repository-selection changes synchronize.
- Verify GitHub API failures do not stop active applications.

Never commit GitHub credentials or webhook secrets.

### 9. Validate Cloudflare with a test zone

Use a least-privilege token and disposable hostname:

- Verify current required account/zone permissions against official Cloudflare documentation.
- Create the named tunnel.
- Retrieve/run the tunnel token securely.
- Create/update DNS CNAME and remote ingress configuration.
- Expose one sample app while keeping another LAN-only.
- Expose the dashboard only with Cloudflare Access plus NixHost login.
- Verify disable/re-enable, cloudflared crash recovery and network reconnect.
- Ensure the token does not appear in normal logs; investigate a safer token-file/stdin mechanism if supported by the installed cloudflared version.

Update docs if current Cloudflare APIs differ.

### 10. Complete the Nix package

The checked-in flake and production `nixhost.nix` now contain a resolved fixed-output dependency hash. Treat that hash as verified release metadata and change it only through a real mismatch-and-rebuild cycle.

Run:

```bash
nix build
```

If a dependency update causes a fixed-output mismatch, copy the reported hash into `nixhost.nix`, then run:

```bash
nix build
nix flake check
./result/bin/nixhost
```

Verify the package contains all Next.js runtime files, static assets, migrations, native modules and production dependencies. If copying pnpm's linked `node_modules` is not relocatable, replace the install phase with a verified pnpm deployment/export strategy; do not keep a package that only works from the source checkout.

Test the package on `x86_64-linux` and `aarch64-linux`. Keep Darwin outputs only if they build and work; otherwise document and temporarily remove unsupported claims rather than bluffing.

### 11. Physical Nix-on-Droid validation

Test on at least two physical ARM64 Android devices from different manufacturers. Record device, Android version, available RAM, Nix-on-Droid version, Nix version and battery settings.

Required tests:

- `nix develop`, install, typecheck, tests and build where practical;
- package/native SQLite operation on `aarch64-linux`;
- deploy `examples/hello-nixhost`;
- LAN access from another device;
- application WebSocket proxy fixture;
- screen off with wake lock;
- Wi-Fi loss/reconnect and Wi-Fi/mobile switching;
- control-plane crash/restart while app remains running;
- memory pressure during Nix build and runtime;
- log growth and retention;
- device reboot restoration using the available Nix-on-Droid boot mechanism;
- explicit Force stop behavior.

Do not claim guaranteed reboot or background persistence when Android/OEM behavior contradicts it. If reliable boot restoration requires a native foreground-service wrapper, document that as the next platform adapter rather than introducing unsupported hacks.

### 12. Security and release review

Run dependency audit, secret scan, and license review. Verify the included canonical Apache-2.0 license text and the Rituraj Basak ownership notice, then review:

- CSRF/origin behavior behind Cloudflare forwarded hosts;
- session fixation/rotation and owner-sensitive action reauthentication;
- path traversal and symlink attacks in Git worktrees/data paths;
- webhook replay and payload limits;
- command argument/environment injection;
- Git credential exposure through process lists or error output;
- Cloudflare token exposure through process arguments;
- log control characters and browser rendering;
- database/file permissions and backups;
- resource exhaustion from logs, webhooks, metrics and deployments;
- SSRF through health paths, repository URLs or proxying;
- application proxy request smuggling/header handling.

Fix concrete issues and add regression tests.

### 13. CI

Add GitHub Actions triggered on all pushes and all pull requests without branch-name restrictions. It must run frozen dependency install, typecheck, unit tests, production build, browser smoke test, Nix flake check/package build where supported, secret scan and dependency audit. Cache safely without making success depend on mutable generated artifacts.

### 14. Final acceptance report

Update `PROJECT_STATUS.md` with:

- exact commands run and results;
- supported systems actually verified;
- Android device matrix;
- GitHub and Cloudflare test results;
- unresolved limitations with evidence;
- no vague “production ready” claim unless every release gate passed.

Provide a concise final report containing:

1. files changed;
2. tests and builds passed;
3. exact setup/run commands;
4. required environment variables;
5. remaining risks;
6. whether the project is truly release-ready.

Do not ask for clarification unless a credential/account action literally cannot proceed. Complete all code, offline tests and documentation first, then list only the external account/device actions the user must perform.
