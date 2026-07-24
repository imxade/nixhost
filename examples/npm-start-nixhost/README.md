# npm start example

This is a minimal production-shaped Node.js application whose runtime contract
is exactly:

```bash
npm run start
```

The flake supplies Node.js and npm, packages the locked application source, and
exposes `apps.<system>.default` for NixHost. The server stays in the foreground,
uses NixHost's injected `HOST` and `PORT`, and provides `GET /health`.

## Run it locally

```bash
HOST=127.0.0.1 PORT=3000 nix run .
curl http://127.0.0.1:3000/health
```

## Deploy it with NixHost

Push this directory to a Git repository, or use it as the repository root, then
create a web deployment with:

- Flake output: `default`
- Health path: `/health`
- Repository subdirectory: `examples/npm-start-nixhost` when deploying from the
  main NixHost repository

NixHost evaluates the flake, starts its default app, and injects runtime
variables such as `HOST`, `PORT`, `DATA_DIR`, and `DEPLOYMENT_ID`.

This dependency-free example intentionally needs no `node_modules`. For an app
with npm dependencies, use `buildNpmPackage` with a committed `package-lock.json`
and a real `npmDepsHash`; never install dependencies from the network at startup.
