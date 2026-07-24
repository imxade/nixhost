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

## LAN-only mode

GitHub cannot deliver to a private RFC1918 address. When `NIXHOST_PUBLIC_URL` is absent, the generated webhook is inactive. The Git reconciler polls each connected production branch and compares its head with the active or newest deployment.

This provides eventual auto-deployment without making the dashboard public, but changes appear after the configured polling interval and use GitHub API calls.

## Public webhook mode

After assigning a stable public dashboard URL, set:

```text
NIXHOST_PUBLIC_URL=https://console.example.com
```

Create/reconnect the GitHub App so its webhook URL points to that origin. Webhooks are HMAC verified, delivery-deduplicated, branch-filtered and converted into durable queue records. The exact `after` commit is deployed.

## Offline behavior

A missed webhook is recovered by branch reconciliation after the node regains internet access. Webhooks improve latency; repository state remains the eventual source of truth.
