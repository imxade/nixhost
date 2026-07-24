# Cloudflare Tunnel

Cloudflare is optional and disabled by default. LAN hosting has no Cloudflare dependency.

## Required token scope

Create a least-privilege token limited to the selected account and every zone NixHost should manage, sufficient to:

- create/read/update the Cloudflare Tunnel;
- obtain its run token;
- update tunnel ingress configuration;
- create/update DNS records in each managed zone;
- read zone metadata so hostnames can be mapped to their zones.

Current Cloudflare guidance maps these operations to an account-level Cloudflare Tunnel/Connector write permission plus DNS edit and Zone read for the managed zones.

## Route model

One named tunnel is used per NixHost node.

```text
console.example.com -> http://127.0.0.1:3000
app.example.com     -> http://127.0.0.1:<stable LAN app port>
```

NixHost creates proxied CNAME records pointing to `<tunnel-id>.cfargotunnel.com` and writes remotely managed ingress rules.

Multiple Cloudflare zones can share the node tunnel when the token can access them. Application hostnames outside those zones are skipped—not modified or treated as an error—so another DNS/TLS provider can proxy those domains to the application's stable LAN port.

Each application's Domains tab and the Cloudflare integration page show every project hostname, its stable local origin, last synchronization time and one of these route states:

- `Cloudflare managed`: DNS and remote tunnel ingress were synchronized;
- `External DNS/TLS`: no accessible Cloudflare zone was found and NixHost left DNS untouched;
- `Awaiting sync` or `Cloudflare not connected`: no synchronization result exists yet;
- `Sync failed`: Cloudflare returned an error, which remains visible with the route.

Saving project domains triggers synchronization when Cloudflare is configured. When a previously managed hostname is removed, NixHost deletes its DNS record only when both the record's target is this node's tunnel and its ownership comment is `Managed by NixHost`; unrelated records are not removed.

## Management protection

Use Cloudflare Access in addition to NixHost login for the console hostname. Application hostnames may remain public or be independently protected.

## Failure semantics

If cloudflared exits, NixHost retries it while the tunnel is enabled. LAN applications continue running. A failed route synchronization must not stop or redeploy applications.
