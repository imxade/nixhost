"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatBytes } from "@/lib/client-api";
import { AccessLinks, type AccessLink } from "./access-links";
import { PageHeading } from "./page-heading";

type Status = {
  host: {
    hostname: string;
    platform: string;
    architecture: string;
    node: string;
    nixSystem: string | null;
    pid: number;
  };
  metric: null | {
    cpuPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    freeDiskBytes: number;
    loadAverage: number[];
    uptimeSeconds: number;
  };
  github: {
    connected: boolean;
    webhookRoute: null | { baseUrl: string; kind: string; stable: boolean };
    reconciliationSeconds: number;
  };
  cloudflare: { configured: boolean; enabled: boolean; running: boolean };
  quickTunnels: {
    enabled: boolean;
    routes: Array<{ key: string; status: string; running: boolean; url: string | null }>;
  };
  accessLinks: AccessLink[];
};

export function SystemClient() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Status>("/api/system/status"));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Load failed");
    }
  }, []);
  useEffect(() => {
    void load();
    const source = new EventSource("/api/events?scope=system");
    source.onmessage = () => void load();
    source.addEventListener("quick_tunnel.ready", () => void load());
    source.addEventListener("quick_tunnel.stopped", () => void load());
    const timer = setInterval(() => void load(), 5000);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [load]);
  return (
    <>
      <PageHeading
        title="System"
        description="Current host health, dashboard access links, and public routing status."
        actions={
          <button type="button" className="btn" onClick={() => void load()}>
            Refresh
          </button>
        }
      />
      {error && <div className="alert alert-error mb-5">{error}</div>}
      {!data ? (
        <span className="loading loading-spinner loading-lg" />
      ) : (
        <>
          <section className="card mb-6 border border-base-300 bg-base-100">
            <div className="card-body">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="card-title">Dashboard access</h2>
                  <p className="text-sm text-base-content/60">
                    Every currently configured LAN, temporary, and custom-domain address.
                  </p>
                </div>
                {data.quickTunnels.enabled && (
                  <span className="badge badge-warning badge-outline">Quick Tunnel enabled</span>
                )}
              </div>
              <AccessLinks links={data.accessLinks} />
              {data.quickTunnels.enabled && (
                <div className="alert alert-warning mt-2 text-sm">
                  Quick Tunnel URLs are temporary, publicly reachable, and intended as a convenient
                  fallback. The dashboard still requires NixHost authentication. Live updates may
                  fall back to polling on this route.
                </div>
              )}
            </div>
          </section>

          <div className="metric-grid mb-6">
            <div className="stat rounded-box border border-base-300 bg-base-100">
              <div className="stat-title">CPU</div>
              <div className="stat-value text-3xl">
                {data.metric?.cpuPercent?.toFixed(1) ?? "—"}%
              </div>
            </div>
            <div className="stat rounded-box border border-base-300 bg-base-100">
              <div className="stat-title">Memory</div>
              <div className="stat-value text-2xl">{formatBytes(data.metric?.memoryUsedBytes)}</div>
              <div className="stat-desc">of {formatBytes(data.metric?.memoryTotalBytes)}</div>
            </div>
            <div className="stat rounded-box border border-base-300 bg-base-100">
              <div className="stat-title">Free disk</div>
              <div className="stat-value text-2xl">{formatBytes(data.metric?.freeDiskBytes)}</div>
            </div>
            <div className="stat rounded-box border border-base-300 bg-base-100">
              <div className="stat-title">Load</div>
              <div className="stat-value text-2xl">
                {data.metric?.loadAverage?.map((value) => value.toFixed(2)).join(" · ") || "—"}
              </div>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body">
                <h2 className="card-title">Host</h2>
                <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
                  <dt className="text-base-content/55">Hostname</dt>
                  <dd>{data.host.hostname}</dd>
                  <dt className="text-base-content/55">Platform</dt>
                  <dd>
                    {data.host.platform} / {data.host.architecture}
                  </dd>
                  <dt className="text-base-content/55">Nix system</dt>
                  <dd className="font-mono">{data.host.nixSystem || "Unavailable"}</dd>
                  <dt className="text-base-content/55">Node.js</dt>
                  <dd className="font-mono">{data.host.node}</dd>
                  <dt className="text-base-content/55">Control PID</dt>
                  <dd className="font-mono">{data.host.pid}</dd>
                </dl>
              </div>
            </div>
            <div className="card border border-base-300 bg-base-100">
              <div className="card-body">
                <h2 className="card-title">Automation and routing</h2>
                <div className="flex justify-between gap-3">
                  <span>GitHub</span>
                  <span
                    className={`badge ${data.github.connected ? "badge-success" : "badge-ghost"}`}
                  >
                    {data.github.connected ? "connected" : "not connected"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Named Cloudflare tunnel</span>
                  <span
                    className={`badge ${data.cloudflare.running ? "badge-success" : data.cloudflare.configured ? "badge-warning" : "badge-ghost"}`}
                  >
                    {data.cloudflare.running
                      ? "running"
                      : data.cloudflare.configured
                        ? "configured"
                        : "not connected"}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span>Temporary routes</span>
                  <span className="badge badge-outline">
                    {data.quickTunnels.routes.filter((route) => route.running).length}/
                    {data.quickTunnels.routes.length} running
                  </span>
                </div>
                <div className="mt-4 rounded-box border border-base-300 p-3 text-sm">
                  <div className="font-medium">Git deployment detection</div>
                  <p className="mt-1 text-base-content/65">
                    Signed webhook target:{" "}
                    {data.github.webhookRoute ? (
                      <a
                        className="link font-mono"
                        href={`${data.github.webhookRoute.baseUrl}/api/github/webhook`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {data.github.webhookRoute.baseUrl}/api/github/webhook
                      </a>
                    ) : (
                      "not available"
                    )}
                    . Periodic Git reconciliation runs every {data.github.reconciliationSeconds}
                    seconds as a safety net. LAN addresses are never registered as external webhook
                    targets.
                  </p>
                </div>
                <div className="alert mt-4 text-sm">
                  Running applications are supervised independently from page requests. Quick
                  Tunnels stay active while NixHost is running; a graceful shutdown closes them.
                  After a crash or device reboot, NixHost may recreate a tunnel with a new URL.
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
