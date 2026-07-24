# Cloudflare Tunnel

Cloudflare is optional and disabled by default. LAN hosting has no Cloudflare dependency.

## Required token scope

Create a least-privilege token limited to the selected account and zone, sufficient to:

- create/read/update the Cloudflare Tunnel;
- obtain its run token;
- update tunnel ingress configuration;
- create/update DNS records in the selected zone.

Verify the exact permissions in Cloudflare's current dashboard before production use.

## Route model

One named tunnel is used per NixHost node.

```text
console.example.com -> http://127.0.0.1:3000
app.example.com     -> http://127.0.0.1:<stable LAN app port>
```

NixHost creates proxied CNAME records pointing to `<tunnel-id>.cfargotunnel.com` and writes remotely managed ingress rules.

## Management protection

Use Cloudflare Access in addition to NixHost login for the console hostname. Application hostnames may remain public or be independently protected.

## Failure semantics

If cloudflared exits, NixHost retries it while the tunnel is enabled. LAN applications continue running. A failed route synchronization must not stop or redeploy applications.
