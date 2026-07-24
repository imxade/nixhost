# GitHub Integration

## Node-owned GitHub App

The dashboard uses GitHub's App Manifest flow so the user does not manually copy an App ID, PEM private key, client secret or webhook secret.

1. NixHost creates a manifest and random state.
2. Browser submits the manifest to GitHub.
3. GitHub returns a short-lived conversion code.
4. NixHost converts it and encrypts the returned credentials.
5. User installs the app and selects repositories.
6. NixHost lists installation repositories using short-lived installation tokens.

Requested repository permissions:

- metadata: read;
- contents: read;

Events:

- push;
- installation;
- installation_repositories.

NixHost uses GitHub's current `2026-03-10` REST API version, 30-second API request deadlines, paginated installation/repository discovery, encrypted App credentials, and short-lived installation tokens.

## LAN-only mode

GitHub cannot deliver to a private RFC1918 address. When `NIXHOST_PUBLIC_URL` is absent, the generated webhook is inactive. The Git reconciler polls each connected production branch and compares its head with the active or newest deployment.

This provides eventual auto-deployment without making the dashboard public, but changes appear after the configured polling interval and use GitHub API calls. A repository may back multiple NixHost applications; every matching auto-deploy application is queued.

## Public webhook mode

After assigning a stable public dashboard URL, set:

```text
NIXHOST_PUBLIC_URL=https://console.example.com
```

Create/reconnect the GitHub App so its webhook URL points to that origin. Webhooks are size-limited, structurally validated, HMAC verified, atomically delivery-deduplicated, branch-filtered and converted into durable queue records. The exact nonzero `after` commit is deployed. Rapid queued updates supersede older queued work for the same application.

## Offline behavior

A missed webhook is recovered by branch reconciliation after the node regains internet access. Webhooks improve latency; repository state remains the eventual source of truth.

When an application is created without an explicit production branch, NixHost
resolves the repository's symbolic remote `HEAD`. It stores that concrete branch
name for deterministic webhook filtering and reconciliation. If the remote does
not advertise a symbolic `HEAD`, the fallback is `main`. Branch names are
validated before they enter Git refspecs.
