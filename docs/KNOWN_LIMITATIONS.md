# Known Limitations

- Android hosting is best effort and can be terminated by the OS or OEM policy.
- Force-stopped Android applications cannot restart themselves.
- Nix-on-Droid is not NixOS and does not provide unavailable kernel features.
- All deployed code shares the NixHost account; there is no hostile workload isolation.
- The initial resource model reports usage but does not enforce hard per-app CPU or memory limits.
- Arbitrary outbound network usage is not attributed per application.
- LAN access always has stable per-app ports. Custom DNS names require the user to configure LAN DNS, Cloudflare, or another DNS/TLS reverse proxy.
- LAN HTTP is unencrypted unless the user adds local TLS or uses a trusted tunnel.
- GitHub auto-deploy is polling-based while the node has no publicly reachable webhook URL.
- The control plane uses a custom Next.js server, so Next.js standalone output is intentionally unavailable.
- Native `better-sqlite3` must be built and validated on every supported system.
- Backup/restore is currently CLI-only.
- Host-based custom-domain routing on the dashboard listener handles ordinary HTTP; use the stable per-app port or Cloudflare route for WebSocket origins.
- Cloudflare integration has not been exercised against a live account in this environment.
- The current Android delivery path requires Nix-on-Droid and terminal setup. The plug-and-play APK, native wrapper and Android release artifacts are a roadmap target for a separate repository, not outputs of this repository.
- No physical ARM64 Android or Maestro result has been recorded in this repository yet; Android release readiness remains blocked on that evidence.
