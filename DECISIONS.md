# Architecture Decisions

## ADR-001 — One full Next.js control plane

**Decision:** Use one self-hosted Next.js App Router application and TypeScript codebase for the dashboard, APIs, authentication, deployment engine, scheduling, process supervision, resource collection, GitHub integration, Cloudflare management, and LAN proxying.

**Reason:** This is the selected product constraint and minimizes language/runtime duplication. Deployed flake applications remain separate processes by necessity.

**Consequence:** The project uses a custom persistent Node HTTP server rather than serverless deployment or Next.js standalone output.

## ADR-002 — Nix flakes are the only deployment definition

**Decision:** Require `flake.nix`, `flake.lock`, and a runnable flake app output. A project can isolate production packaging in `nixhost.nix`, imported by the flake, but NixHost never evaluates that loose file directly. Do not add dashboard-defined build/start shell commands.

**Reason:** This keeps the application package reproducible and prevents the control plane from becoming an unrestricted remote shell interface.

## ADR-003 — GitHub-only repository import initially

**Decision:** Accept dashboard-selected GitHub App repositories or canonical HTTPS `github.com/<owner>/<repo>` URLs only.

**Reason:** GitHub is the required initial experience. Restricting hosts avoids a large SSRF/internal-network and credential-handling surface. Other Git providers require explicit future adapters and threat review.

## ADR-004 — Stable LAN proxy port plus rotating candidate port

**Decision:** Assign each web application a stable LAN listener and each release a private candidate port.

**Reason:** It permits health-checked activation, preserves the old healthy release on failure, and keeps a stable LAN URL without requiring local wildcard DNS.

## ADR-005 — SQLite is the durable source of truth

**Decision:** Use SQLite WAL mode through `better-sqlite3`; keep large logs, Git mirrors, releases, and application data in files.

**Reason:** A single-node personal host does not need an external database or broker. Queue and desired state must survive control-plane restarts.

## ADR-006 — File-backed application logs

**Decision:** Redirect detached application stdout/stderr directly to append-only files and stream them to browsers through SSE.

**Reason:** Applications can continue logging if the Next.js control plane restarts, and pipe backpressure cannot freeze an unattended child process.

## ADR-007 — Optional Cloudflare, LAN first

**Decision:** Start with authenticated LAN access. Cloudflare Tunnel is configured later per node and per application.

**Reason:** Initial use must not require a public account or domain. The same localhost origins can later be exposed through outbound tunnels.

## ADR-008 — No security claim between applications

**Decision:** Treat all deployed repositories as trusted code under one host account.

**Reason:** Nix-on-Droid and ordinary unprivileged Nix execution do not provide VM/container-grade isolation or secure multi-tenancy.

## ADR-009 — Android persistence is best effort

**Decision:** Document wake-lock, battery-management, reboot, and Force-stop limitations. Do not claim VPS uptime.

**Reason:** Android and OEM lifecycle policy remains outside the Next.js process’s control. A future native foreground-service wrapper is a platform adapter, not a replacement control plane.

## ADR-010 — Standalone APK is the Android distribution target

**Decision:** Keep Nix-on-Droid as the current engineering and validation track, while targeting a future self-contained APK that starts a native foreground-service adapter and opens the existing web interface without separate terminal setup.

**Reason:** The intended Android experience is install, open, configure and host. The Next.js control plane, Nix flake application contract, authenticated LAN access and optional Cloudflare path remain consistent across distributions.

**Consequence:** APK readiness requires an explicit Android packaging design, compliant delivery of the Nix/runtime dependencies, Maestro UI automation and physical multi-OEM lifecycle tests. The APK source, foreground-service adapter, signing configuration and binaries belong to a separate Android distribution repository. Documentation in this repository must not imply that the APK exists until those gates pass.
