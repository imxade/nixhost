"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatBytes } from "@/lib/client-api";
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
  github: { connected: boolean };
  cloudflare: { configured: boolean; enabled: boolean; running: boolean };
};
export function SystemClient() {
  const [data, setData] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await apiFetch<Status>("/api/system/status"));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <>
      <PageHeading
        title="System"
        description="Capabilities and current resource pressure on this NixHost node."
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
                {data.metric?.loadAverage?.map((v) => v.toFixed(2)).join(" · ") || "—"}
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
                <h2 className="card-title">Integrations</h2>
                <div className="flex justify-between">
                  <span>GitHub</span>
                  <span
                    className={`badge ${data.github.connected ? "badge-success" : "badge-ghost"}`}
                  >
                    {data.github.connected ? "connected" : "not connected"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Cloudflare</span>
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
                <div className="alert mt-4">
                  <span>
                    Running applications are detached from the Next.js control-plane process and can
                    survive a control-plane restart. Android may still terminate processes under
                    system pressure.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
