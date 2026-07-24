# Known Limitations

- Android hosting is best effort and can be terminated by the OS or OEM policy.
- Force-stopped Android applications cannot restart themselves.
- Nix-on-Droid is not NixOS and does not provide unavailable kernel features.
- All deployed code shares the NixHost account; there is no hostile workload isolation.
- The initial resource model reports usage but does not enforce hard per-app CPU or memory limits.
- Arbitrary outbound network usage is not attributed per application.
- LAN endpoints use ports rather than automatic local wildcard DNS.
- LAN HTTP is unencrypted unless the user adds local TLS or uses a trusted tunnel.
- GitHub auto-deploy is polling-based while the node has no publicly reachable webhook URL.
- The control plane uses a custom Next.js server, so Next.js standalone output is intentionally unavailable.
- Native `better-sqlite3` must be built and validated on every supported system.
- The delivered source needs locally generated `pnpm-lock.yaml`, `flake.lock` and Nix dependency hash.
- File log rotation and backup/restore UI are not yet implemented.
- PID recovery does not yet validate Linux process start time against PID reuse.
- Cloudflare integration has not been exercised against a live account in this environment.
