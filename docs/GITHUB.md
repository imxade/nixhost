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

GitHub sends the `installation` and `installation_repositories` lifecycle events
to GitHub Apps automatically; GitHub does not permit them in a manifest's
`default_events`. NixHost therefore requests only `push`. The manifest also sets
`setup_on_update`, so returning from GitHub after an installation or repository
selection change refreshes the complete installation list from GitHub rather
than trusting a callback query parameter.

NixHost uses GitHub's current `2026-03-10` REST API version, 30-second API
request deadlines, complete paginated installation/repository discovery,
encrypted App credentials, and short-lived installation tokens. The
Applications page exposes the connection action directly and searches across
every repository available to every active installation. GitHub's installation
selection remains the permission boundary; use **Manage GitHub access** to grant
the App additional repositories. HTTPS Git operations pass installation tokens
as scoped `x-access-token` HTTP Basic credentials without storing credentials in
the repository URL. The import dialog also keeps a separate **Public URL** path
for public GitHub repositories that should be cloned without App credentials.

## LAN-only mode

GitHub cannot deliver to a private RFC1918 address. When
`NIXHOST_PUBLIC_URL` is absent, the generated manifest supplies the reserved
`https://example.com/` URL with `active: false`. GitHub's current manifest
validator rejects both an omitted/blank hook URL and a private hook URL, even
for an inactive hook. The reserved sentinel receives no events because the hook
is inactive. The Git reconciler polls each connected production branch and
compares its head with the active or newest deployment.

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

## Public push-redeployment test

`pnpm test:github-public` is an explicitly destructive external acceptance
test. With `NIXHOST_PUBLIC_TEST_PUSH=1`, it clones the named public test
repository, deploys its exact remote-HEAD revision, pushes a marker commit, runs
the production reconciliation code, and requires the pushed revision to become
healthy on the stable proxy while the previous release becomes superseded.

The maintained fixture is
`https://github.com/imxade/nixhost-deployment-test.git`, whose default branch is
`trunk`. This verifies both push-triggered redeployment and default-branch
resolution. It does not replace the live GitHub App authorization, signed
webhook, selected private repository, or missed-webhook recovery gates.
