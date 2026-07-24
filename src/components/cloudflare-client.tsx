"use client";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { apiFetch, formatDate } from "@/lib/client-api";
import { type DomainRoute, DomainRouteStatusBadge } from "./domain-route-status";
import { PageHeading } from "./page-heading";

type Status = {
  configured: boolean;
  enabled: boolean;
  running: boolean;
  tunnelId: string | null;
  dashboardHostname: string | null;
  routes: DomainRoute[];
};
export function CloudflareClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      setStatus(await apiFetch<Status>("/api/cloudflare/status"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function configure(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy("configure");
    const f = new FormData(e.currentTarget);
    try {
      setStatus(
        await apiFetch<Status>("/api/cloudflare/configure", {
          method: "POST",
          body: JSON.stringify({
            accountId: f.get("accountId"),
            zoneId: f.get("zoneId"),
            apiToken: f.get("apiToken"),
            tunnelName: f.get("tunnelName"),
            dashboardHostname: f.get("dashboardHostname"),
          }),
        }),
      );
    } catch (c) {
      setError(c instanceof Error ? c.message : "Configuration failed");
    } finally {
      setBusy("");
    }
  }
  async function toggle() {
    setBusy("toggle");
    try {
      setStatus(
        await apiFetch<Status>(`/api/cloudflare/${status?.enabled ? "disable" : "enable"}`, {
          method: "POST",
        }),
      );
    } catch (c) {
      setError(c instanceof Error ? c.message : "Tunnel action failed");
    } finally {
      setBusy("");
    }
  }
  async function sync() {
    setBusy("sync");
    try {
      setStatus(await apiFetch<Status>("/api/cloudflare/sync", { method: "POST" }));
    } catch (c) {
      setError(c instanceof Error ? c.message : "Route sync failed");
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <PageHeading
        title="Cloudflare Tunnel"
        description="Optional outbound-only public access. LAN hosting works without Cloudflare; enable it later to assign HTTPS hostnames to selected applications."
        actions={
          status?.configured ? (
            <>
              <button type="button" disabled={!!busy} className="btn" onClick={() => void sync()}>
                Sync routes
              </button>
              <button
                type="button"
                disabled={!!busy}
                className={`btn ${status.enabled ? "btn-warning" : "btn-primary"}`}
                onClick={() => void toggle()}
              >
                {status.enabled ? "Disable tunnel" : "Enable tunnel"}
              </button>
            </>
          ) : undefined
        }
      />
      {error && <div className="alert alert-error mb-5">{error}</div>}
      <div className="grid gap-5 xl:grid-cols-2">
        <form onSubmit={configure} className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">
              {status?.configured ? "Update connection" : "Connect Cloudflare"}
            </h2>
            <p className="text-sm text-base-content/65">
              Use a least-privilege API token restricted to the chosen account and zone.
            </p>
            <label className="form-control">
              <span className="label-text mb-1">Account ID</span>
              <input required name="accountId" className="input input-bordered font-mono" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Zone ID</span>
              <input required name="zoneId" className="input input-bordered font-mono" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">API token</span>
              <input required name="apiToken" type="password" className="input input-bordered" />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Tunnel name</span>
              <input
                required
                name="tunnelName"
                defaultValue="nixhost"
                className="input input-bordered"
              />
            </label>
            <label className="form-control">
              <span className="label-text mb-1">Dashboard hostname (optional)</span>
              <input
                name="dashboardHostname"
                placeholder="console.example.com"
                className="input input-bordered"
              />
            </label>
            <div className="card-actions justify-end">
              <button type="submit" disabled={busy === "configure"} className="btn btn-primary">
                {busy === "configure" ? (
                  <span className="loading loading-spinner" />
                ) : (
                  "Save and create tunnel"
                )}
              </button>
            </div>
          </div>
        </form>
        <div className="card border border-base-300 bg-base-100">
          <div className="card-body">
            <h2 className="card-title">Tunnel status</h2>
            {!status ? (
              <span className="loading loading-spinner" />
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span>Configured</span>
                  <span className={`badge ${status.configured ? "badge-success" : "badge-ghost"}`}>
                    {String(status.configured)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Enabled</span>
                  <span className={`badge ${status.enabled ? "badge-success" : "badge-ghost"}`}>
                    {String(status.enabled)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Process</span>
                  <span className={`badge ${status.running ? "badge-success" : "badge-ghost"}`}>
                    {status.running ? "running" : "stopped"}
                  </span>
                </div>
                <div>
                  <div className="text-sm text-base-content/55">Tunnel ID</div>
                  <div className="font-mono text-sm break-all">{status.tunnelId || "—"}</div>
                </div>
                <div>
                  <div className="text-sm text-base-content/55">Dashboard hostname</div>
                  <div>{status.dashboardHostname || "Not exposed"}</div>
                </div>
                <div className="alert alert-warning">
                  <span>
                    Protect the dashboard hostname with Cloudflare Access as an additional layer.
                    NixHost login remains required.
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <section className="card mt-5 border border-base-300 bg-base-100">
        <div className="card-body">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="card-title">Application domain routes</h2>
              <p className="mt-1 text-sm text-base-content/65">
                Every project hostname is listed here, including domains intentionally managed by
                another DNS/TLS provider.
              </p>
            </div>
            <Link href="/apps" className="btn btn-sm">
              Manage applications
            </Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Hostname</th>
                  <th>Route state</th>
                  <th>Stable origin</th>
                  <th>Last sync</th>
                </tr>
              </thead>
              <tbody>
                {status?.routes.map((route) => (
                  <tr key={route.hostname}>
                    <td>
                      <Link href={`/apps/${route.appId}`} className="link font-medium">
                        {route.appName}
                      </Link>
                    </td>
                    <td className="font-mono">{route.hostname}</td>
                    <td>
                      <DomainRouteStatusBadge status={route.status} />
                      {route.lastError && (
                        <div className="mt-1 max-w-md text-xs text-error">{route.lastError}</div>
                      )}
                    </td>
                    <td className="font-mono">127.0.0.1:{route.publicPort}</td>
                    <td>{route.lastSyncedAt ? formatDate(route.lastSyncedAt) : "Not synced"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {status && status.routes.length === 0 && (
            <div className="rounded-box border border-dashed border-base-300 p-5 text-sm text-base-content/65">
              No application domains are configured. Open an application, select Domains, add its
              hostnames, and save; NixHost will synchronize eligible Cloudflare zones automatically.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
