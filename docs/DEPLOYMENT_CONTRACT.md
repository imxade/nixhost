# Deployment Contract

## Required repository files

```text
flake.nix
flake.lock
```

NixHost refuses an unlocked production deployment. The lock file is the reproducibility boundary for external flake inputs.

## Required output

Preferred:

```nix
apps.${system}.default = {
  type = "app";
  program = "${package}/bin/application";
};
```

Named outputs are supported and selected as `.#name` in the dashboard.

## Runtime rules

The executable must:

- stay in the foreground;
- exit non-zero on unrecoverable failure;
- write logs to stdout/stderr;
- use the injected `HOST` and `PORT` for web applications;
- store mutable durable data under `DATA_DIR`;
- avoid privileged ports, systemd, Docker, KVM, kernel modules and root-only paths.

Injected variables:

```text
NIXHOST=1
APP_ID
APP_NAME
DEPLOYMENT_ID
RELEASE_DIR
DATA_DIR
CACHE_DIR
LOG_DIR
HOST=127.0.0.1
PORT=<candidate port>   # web apps only
```

User-defined variables cannot replace reserved names.

## Invocation

```bash
nix flake metadata --json
nix flake show --json
nix run --no-write-lock-file .#<output>
```

NixHost passes arguments as an array and does not construct a user-controlled shell command.

## Health

A web deployment activates when its configured path returns HTTP 200–399 before the startup timeout. Redirects are not followed. A worker activates after remaining alive through the configured stability window.

## Trust

The flake can execute arbitrary build and runtime code as the NixHost OS account. Do not import untrusted repositories. Nix evaluation and the Nix store are not application isolation.
