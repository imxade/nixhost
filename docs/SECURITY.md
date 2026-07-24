# Security Model

## Threat model

NixHost protects the management interface and stored credentials from unauthenticated LAN clients. It does not protect the host from a malicious deployed repository, and it does not isolate one application from another.

## Authentication

- One-time setup token generated locally and stored with mode 0600.
- The production command has no default username or password.
- The separate `pnpm start:ci` command binds only to loopback, recreates a
  guarded disposable data directory, and provisions the documented insecure
  browser-test admin. It must never be used for a LAN or production node.
- Passwords hashed with scrypt and per-password random salt.
- Random opaque session cookies; only token hashes are stored.
- HttpOnly, SameSite=Lax cookies; Secure when accessed over HTTPS.
- Failed logins are limited in fixed one-hour windows: six per source/username
  pair and 30 across usernames from one source. Throttled responses include
  `Retry-After`.
- Owner/admin/operator/viewer authorization checks on every write API.

## Request protection

- Mutation requests require a same-host `Origin`.
- JSON bodies have explicit size limits.
- GitHub webhook bypasses browser-origin checks but requires SHA-256 HMAC validation.
- Webhook delivery IDs are deduplicated.
- Security response headers and CSP are configured centrally.

LAN HTTP remains readable by an attacker who can observe the local network. Use a trusted LAN or local HTTPS. Cloudflare HTTPS protects the browser-to-edge connection but does not change the trusted-workload model.

## Secret storage

- Application values, GitHub private key/secret and Cloudflare token are encrypted with AES-256-GCM.
- Master key comes from `NIXHOST_MASTER_KEY` or a mode-0600 local key file.
- Existing values are never sent back to the dashboard.
- Logs attempt no magical generic redaction; applications can transform or exfiltrate any secret provided to them.

For the integrated Android app, replace the local key-file fallback with Android Keystore wrapping.

## Process execution

- Executable and argument arrays are passed directly to `spawn`.
- Git credentials are supplied as process environment configuration, not embedded in repository URLs.
- Applications receive a controlled working directory and explicit runtime variables.
- Each application starts in a distinct POSIX process group for group termination.

## Remaining high-priority hardening

- Verify PID start time to defend against PID reuse before signalling recovered processes.
- Add re-authentication for owner password/user/Cloudflare changes.
- Add encrypted configuration export and tested restore.
- Add optional local TLS and passkeys.
- Verify Cloudflare API token permissions before storing.
- Add dependency vulnerability and license scanning to CI.
- Obtain independent security review before exposing the dashboard to the internet.
