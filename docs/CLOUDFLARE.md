# Cloudflare

Cloudflare remains optional. LAN hosting has no Cloudflare dependency and a
fresh node never exposes itself to the Internet automatically.

## Recommended OAuth connection

The primary user flow is:

1. Select **Connect Cloudflare**.
2. Authorize the requested permissions in Cloudflare.
3. Select an active DNS zone.
4. Optionally enter a dashboard hostname.
5. NixHost creates, configures and enables one persistent remotely managed
   tunnel.

The distribution must provide:

```text
NIXHOST_CLOUDFLARE_OAUTH_CLIENT_ID
NIXHOST_CLOUDFLARE_OAUTH_REDIRECT_URI
NIXHOST_CLOUDFLARE_OAUTH_SCOPES
```

Register a public Cloudflare OAuth client using Authorization Code, PKCE S256
and token endpoint authentication method `none`. The registered redirect URI
must resolve to `/api/cloudflare/oauth/callback`. Public client registration
requires Cloudflare publisher-domain verification. The repository and future
APK must never contain a client secret.

The OAuth client should request only the scopes required to list authorized
accounts/zones, create/read/update the Cloudflare Tunnel, obtain its run token,
write remote ingress configuration and manage DNS in authorized zones.
Cloudflare currently describes those resource permissions as account-level
Cloudflare Tunnel/Connector edit plus Zone read and DNS edit.
Set `NIXHOST_CLOUDFLARE_OAUTH_SCOPES` to the exact space-delimited scope values
configured on that client; NixHost includes the same values in every
authorization request.

NixHost generates a random ten-minute OAuth state and PKCE verifier. Only the
state hash is used for lookup; the encrypted verifier is consumed exactly once
before code exchange. Access and refresh tokens are encrypted with the node
master key. Expiring access tokens refresh under a single in-process refresh
operation, and rotated refresh tokens replace the previous encrypted value.
Tokens are never returned to the browser.

The callback does not depend on a dashboard cookie because a registered HTTPS
callback hostname can differ from the LAN hostname. Its single-use state record
binds completion to the authenticated user who started authorization. Account
and zone selection APIs still require that same authenticated owner/admin.

Cloudflare account administrators can disable public OAuth applications. The
manual API-token flow remains available for those installations and for
distributor builds without a configured OAuth client.

## Manual fallback

Create a least-privilege token restricted to the selected account and every
zone NixHost should manage:

- Cloudflare Tunnel/Connector edit;
- DNS edit;
- Zone read.

Before saving it, NixHost verifies that the token is active, the selected zone
belongs to the selected account and the token can list that account's tunnels.
An invalid or cross-account credential never replaces a working configuration.

## Persistent route model

One named tunnel is used per node:

```text
console.example.com -> http://127.0.0.1:3000
app.example.com     -> http://127.0.0.1:<stable LAN app port>
```

NixHost creates proxied CNAME records targeting
`<tunnel-id>.cfargotunnel.com` and writes remotely managed ingress rules. The
tunnel starts automatically on later NixHost boots once the owner has enabled
it.

NixHost does not assign a default public hostname. The operator explicitly
chooses every dashboard and application domain.

The dashboard hostname is optional and can be added, changed or removed after
connection without re-entering credentials. A successfully synchronized
dashboard hostname also becomes the preferred GitHub webhook origin.

Multiple Cloudflare zones can share the node tunnel when the authorization can
access them. Application hostnames outside those zones are skipped—not modified
or treated as an error—so another DNS/TLS provider can proxy those domains to
the application's stable LAN port.

Each application's Domains tab and the Cloudflare page show:

- `Cloudflare managed`: DNS and remote tunnel ingress synchronized;
- `External DNS/TLS`: no authorized Cloudflare zone was found and DNS was left
  untouched;
- `Awaiting sync` or `Cloudflare not connected`: no result exists yet;
- `Sync failed`: Cloudflare returned an error, retained with the route.

Saving project domains triggers synchronization when Cloudflare is configured.
When a managed hostname is removed, NixHost deletes the record only if its
target is this node's tunnel and its ownership comment is `Managed by NixHost`.
Unrelated DNS records are never deleted.

## Protection and failure behavior

Use Cloudflare Access in addition to NixHost login for the dashboard hostname.
Application domains may remain public or have independent Access policies.

If `cloudflared` exits, NixHost retries while the selected tunnel mode remains
enabled. LAN applications continue running. Route synchronization failure does
not stop or redeploy applications, and a candidate Cloudflare configuration
does not overwrite valid credentials until its access boundary is verified.
