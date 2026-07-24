"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, formatDate } from "@/lib/client-api";
import { PageHeading } from "./page-heading";
import { StatusBadge } from "./status-badge";

type Deployment = {
  id: string;
  app_id: string;
  state: string;
  commit_sha: string | null;
  requested_ref: string;
  trigger: string;
  queued_at: string;
  failure_message: string | null;
};
type App = { id: string; name: string };
export function DeploymentsClient() {
  const [rows, setRows] = useState<Deployment[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const [d, a] = await Promise.all([
        apiFetch<Deployment[]>("/api/deployments?limit=100"),
        apiFetch<App[]>("/api/apps"),
      ]);
      setRows(d);
      setApps(a);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);
  useEffect(() => {
    void load();
    const source = new EventSource("/api/events");
    source.onmessage = () => void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      source.close();
      clearInterval(timer);
    };
  }, [load]);
  const names = new Map(apps.map((a) => [a.id, a.name]));
  return (
    <>
      <PageHeading
        title="Deployments"
        description="Durable deployment history across every application. Queued work survives control-plane restarts."
        actions={
          <button type="button" className="btn" onClick={() => void load()}>
            Refresh
          </button>
        }
      />
      {error && <div className="alert alert-error mb-5">{error}</div>}
      <div className="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table className="table">
          <thead>
            <tr>
              <th>Application</th>
              <th>Status</th>
              <th>Revision</th>
              <th>Trigger</th>
              <th>Queued</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link className="link font-medium" href={`/apps/${row.app_id}`}>
                    {names.get(row.app_id) || row.app_id.slice(0, 8)}
                  </Link>
                </td>
                <td>
                  <StatusBadge state={row.state} />
                </td>
                <td className="font-mono text-xs">
                  {(row.commit_sha || row.requested_ref).slice(0, 12)}
                </td>
                <td>{row.trigger}</td>
                <td>{formatDate(row.queued_at)}</td>
                <td>
                  {row.failure_message && (
                    <span className="tooltip" data-tip={row.failure_message}>
                      ⚠
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-5 text-base-content/60">No deployments yet.</p>}
      </div>
    </>
  );
}
