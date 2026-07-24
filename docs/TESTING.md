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
```

Required CI matrix after lock generation:

- x86_64 Linux, Node 24;
- aarch64 Linux through native runner or QEMU for compile-only checks;
- macOS ARM64 for portability checks;
- Nix `flake check` and package build;
- dependency audit and secret scan.

## Integration fixtures

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

## Real Android gate

No Android production claim is allowed until all Phase 0 tests in the PRD pass on at least two physical ARM64 devices from different OEMs. Record Android version, Nix-on-Droid version, Nix version, device memory, battery settings and exact failures.

## Quality-tooling rule

Biome is the only formatter and linter. ESLint, Prettier, and framework-generated ESLint configuration must not be introduced. CI must run `pnpm biome:ci` before type checking and tests.
