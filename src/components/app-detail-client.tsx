"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, formatBytes, formatDate } from "@/lib/client-api";
import { PageHeading } from "./page-heading";
import { StatusBadge } from "./status-badge";

type App = {
  id: string;
  name: string;
  slug: string;
  kind: string;
  repository_url: string;
  branch: string;
  flake_output: string;
  auto_deploy: number;
  desired_state: string;
  restart_policy: string;
  health_path: string;
  public_port: number | null;
  active_internal_port: number | null;
  active_deployment_id: string | null;
  updated_at: string;
};
type Deployment = {
  id: string;
  state: string;
  commit_sha: string | null;
  requested_ref: string;
  trigger: string;
  queued_at: string;
  activated_at: string | null;
  failure_message: string | null;
  resource_confidence: string;
};
type Env = { key: string; secret: boolean; updatedAt: string };
type Payload = {
  app: App;
  domains: string[];
  environment: Env[];
  deployments: Deployment[];
  metric: null | {
    capturedAt: string;
    cpuPercent: number;
    memoryBytes: number;
    processCount: number;
  };
};

export function AppDetailClient({ appId }: { appId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [browserHost, setBrowserHost] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [logDeployment, setLogDeployment] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);
  const load = useCallback(async () => {
    try {
      const value = await apiFetch<Payload>(`/api/apps/${appId}`);
      setData(value);
      setLogDeployment((current) => current ?? value.deployments[0]?.id ?? null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Load failed");
    }
  }, [appId]);
  useEffect(() => {
    setBrowserHost(window.location.hostname);
    void load();
    const source = new EventSource(`/api/events?scope=app:${appId}`);
    source.onmessage = () => void load();
    source.addEventListener("deployment.state", () => void load());
    source.addEventListener("deployment.queued", () => void load());
    const interval = setInterval(() => void load(), 5000);
    return () => {
      source.close();
      clearInterval(interval);
    };
  }, [appId, load]);
  useEffect(() => {
    if (!logDeployment) return;
    setLogs("");
    const source = new EventSource(`/api/deployments/${logDeployment}/logs`);
    source.addEventListener("log", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { stream: string; text: string };
      setLogs((current) => (current + payload.text).slice(-300000));
      requestAnimationFrame(() => {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      });
    });
    return () => source.close();
  }, [logDeployment]);
  async function action(name: "deploy" | "start" | "stop" | "restart") {
    setBusy(name);
    setError("");
    try {
      await apiFetch(`/api/apps/${appId}/${name}`, {
        method: "POST",
        body: name === "deploy" ? "{}" : undefined,
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${name} failed`);
    } finally {
      setBusy("");
    }
  }
  async function redeploy(commitSha: string | null) {
    if (!commitSha) return;
    setBusy(`redeploy-${commitSha}`);
    try {
      await apiFetch(`/api/apps/${appId}/deploy`, {
        method: "POST",
        body: JSON.stringify({ commitSha }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Redeploy failed");
    } finally {
      setBusy("");
    }
  }
  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("settings");
    const form = new FormData(event.currentTarget);
    const domains = String(form.get("domains") ?? "")
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    try {
      await apiFetch(`/api/apps/${appId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          branch: form.get("branch"),
          flakeOutput: form.get("flakeOutput"),
          healthPath: form.get("healthPath"),
          restartPolicy: form.get("restartPolicy"),
          autoDeploy: form.get("autoDeploy") === "on",
          domains,
        }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed");
    } finally {
      setBusy("");
    }
  }
  async function addEnv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("env");
    const element = event.currentTarget;
    const form = new FormData(element);
    const key = String(form.get("key"));
    const value = String(form.get("value"));
    try {
      await apiFetch(`/api/apps/${appId}/environment`, {
        method: "PUT",
        body: JSON.stringify({ variables: { [key]: value }, secret: form.get("secret") === "on" }),
      });
      element.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Environment update failed");
    } finally {
      setBusy("");
    }
  }
  async function removeEnv(key: string) {
    try {
      await apiFetch(`/api/apps/${appId}/environment`, {
        method: "DELETE",
        body: JSON.stringify({ key }),
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
    }
  }
  async function removeApp() {
    if (
      !confirm(
        "Delete this application, deployment history, and local route? Persistent app data remains on disk for manual recovery.",
      )
    )
      return;
    setBusy("delete");
    try {
      await apiFetch(`/api/apps/${appId}`, { method: "DELETE" });
      router.replace("/apps");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed");
      setBusy("");
    }
  }
  const selected = useMemo(
    () => data?.deployments.find((item) => item.id === logDeployment),
    [data, logDeployment],
  );
  if (!data)
    return (
      <div>
        {error ? (
          <div className="alert alert-error">{error}</div>
        ) : (
          <span className="loading loading-spinner loading-lg" />
        )}
      </div>
    );
  const app = data.app;
  const lan = app.public_port && browserHost ? `http://${browserHost}:${app.public_port}` : null;
  return (
    <>
      <PageHeading
        title={app.name}
        description={app.repository_url}
        actions={
          <>
            <button
              type="button"
              disabled={!!busy}
              className="btn btn-primary"
              onClick={() => void action("deploy")}
            >
              {busy === "deploy" ? <span className="loading loading-spinner" /> : "Deploy"}
            </button>
            {app.desired_state === "running" ? (
              <button
                type="button"
                disabled={!!busy}
                className="btn"
                onClick={() => void action("restart")}
              >
                Restart
              </button>
            ) : (
              <button
                type="button"
                disabled={!!busy}
                className="btn"
                onClick={() => void action("start")}
              >
                Start
              </button>
            )}
            <button
              type="button"
              disabled={!!busy || app.desired_state === "stopped"}
              className="btn btn-ghost"
              onClick={() => void action("stop")}
            >
              Stop
            </button>
          </>
        }
      />
      {error && (
        <div className="alert alert-error mb-5">
          <span>{error}</span>
        </div>
      )}
      {data.deployments[0]?.state === "failed" && (
        <div className="alert alert-error mb-5">
          <div>
            <div className="font-bold">Latest deployment failed</div>
            <div>
              {data.deployments[0].failure_message || "Open deployment logs for details."}
              {data.deployments[0].resource_confidence !== "none"
                ? ` Resource-exhaustion confidence: ${data.deployments[0].resource_confidence}.`
                : ""}
            </div>
          </div>
        </div>
      )}
      <div className="metric-grid mb-6">
        <div className="stat rounded-box border border-base-300 bg-base-100">
          <div className="stat-title">Desired state</div>
          <div className="stat-value text-xl">
            <StatusBadge state={app.desired_state} />
          </div>
        </div>
        <div className="stat rounded-box border border-base-300 bg-base-100">
          <div className="stat-title">LAN endpoint</div>
          <div className="stat-value text-lg font-mono">
            {app.public_port ? `:${app.public_port}` : "worker"}
          </div>
          {lan && (
            <div className="stat-desc">
              <a className="link" href={lan} target="_blank" rel="noreferrer">
                Open application
              </a>
            </div>
          )}
        </div>
        <div className="stat rounded-box border border-base-300 bg-base-100">
          <div className="stat-title">Production branch</div>
          <div className="stat-value text-lg font-mono">{app.branch}</div>
          <div className="stat-desc">Auto deploy {app.auto_deploy ? "enabled" : "disabled"}</div>
        </div>
        <div className="stat rounded-box border border-base-300 bg-base-100">
          <div className="stat-title">Resource usage</div>
          <div className="stat-value text-lg">
            {data.metric ? `${data.metric.cpuPercent.toFixed(1)}% CPU` : "—"}
          </div>
          <div className="stat-desc">
            {data.metric
              ? `${formatBytes(data.metric.memoryBytes)} · ${data.metric.processCount} processes`
              : "No sample"}
          </div>
        </div>
      </div>

      <div role="tablist" className="tabs tabs-lifted">
        <input
          type="radio"
          name="app-tabs"
          role="tab"
          className="tab"
          aria-label="Deployments"
          defaultChecked
        />
        <div role="tabpanel" className="tab-content border-base-300 bg-base-100 p-5">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Revision</th>
                  <th>Trigger</th>
                  <th>Queued</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>
                      <StatusBadge state={deployment.state} />
                    </td>
                    <td className="font-mono text-xs">
                      {(deployment.commit_sha || deployment.requested_ref).slice(0, 12)}
                    </td>
                    <td>{deployment.trigger}</td>
                    <td>{formatDate(deployment.queued_at)}</td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() => setLogDeployment(deployment.id)}
                        >
                          Logs
                        </button>
                        {deployment.commit_sha && (
                          <button
                            type="button"
                            className="btn btn-xs btn-ghost"
                            disabled={!!busy}
                            onClick={() => void redeploy(deployment.commit_sha)}
                          >
                            Redeploy
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.deployments.length === 0 && (
            <p className="text-base-content/60">No deployments yet.</p>
          )}
        </div>
        <input type="radio" name="app-tabs" role="tab" className="tab" aria-label="Live logs" />
        <div role="tabpanel" className="tab-content border-base-300 bg-base-100 p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              {selected ? (
                <>
                  <StatusBadge state={selected.state} />{" "}
                  <span className="ml-2 font-mono text-xs">{selected.id.slice(0, 8)}</span>
                </>
              ) : (
                "Select a deployment"
              )}
            </div>
            <select
              className="select select-bordered select-sm"
              value={logDeployment ?? ""}
              onChange={(e) => setLogDeployment(e.target.value)}
            >
              {data.deployments.map((deployment) => (
                <option key={deployment.id} value={deployment.id}>
                  {deployment.state} ·{" "}
                  {(deployment.commit_sha || deployment.requested_ref).slice(0, 10)}
                </option>
              ))}
            </select>
          </div>
          <pre
            ref={logRef}
            className="h-[30rem] overflow-auto rounded-box bg-neutral p-4 text-xs text-neutral-content whitespace-pre-wrap"
          >
            {logs || "Waiting for log output…"}
          </pre>
          {selected?.failure_message && (
            <div className="alert alert-error mt-4">
              <span>
                {selected.failure_message}
                {selected.resource_confidence !== "none"
                  ? ` · resource confidence: ${selected.resource_confidence}`
                  : ""}
              </span>
            </div>
          )}
        </div>
        <input type="radio" name="app-tabs" role="tab" className="tab" aria-label="Environment" />
        <div role="tabpanel" className="tab-content border-base-300 bg-base-100 p-5">
          <form onSubmit={addEnv} className="grid gap-3 md:grid-cols-[1fr_2fr_auto_auto]">
            <input
              required
              name="key"
              className="input input-bordered font-mono"
              placeholder="DATABASE_URL"
            />
            <input
              required
              name="value"
              type="password"
              className="input input-bordered"
              placeholder="Value"
            />
            <label className="label cursor-pointer gap-2">
              <span className="label-text">Secret</span>
              <input name="secret" type="checkbox" defaultChecked className="checkbox" />
            </label>
            <button type="submit" disabled={busy === "env"} className="btn btn-primary">
              Add
            </button>
          </form>
          <div className="mt-5 divide-y divide-base-300 rounded-box border border-base-300">
            {data.environment.map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3">
                <div>
                  <div className="font-mono font-medium">{item.key}</div>
                  <div className="text-xs text-base-content/55">
                    {item.secret ? "Encrypted secret" : "Encrypted value"} ·{" "}
                    {formatDate(item.updatedAt)}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void removeEnv(item.key)}
                >
                  Remove
                </button>
              </div>
            ))}
            {data.environment.length === 0 && (
              <div className="p-4 text-base-content/60">No application variables configured.</div>
            )}
          </div>
        </div>
        <input type="radio" name="app-tabs" role="tab" className="tab" aria-label="Settings" />
        <div role="tabpanel" className="tab-content border-base-300 bg-base-100 p-5">
          <form onSubmit={saveSettings} className="grid max-w-3xl gap-4">
            <label className="form-control">
              <span className="label-text mb-1">Name</span>
              <input name="name" defaultValue={app.name} className="input input-bordered" />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Branch</span>
                <input
                  name="branch"
                  defaultValue={app.branch}
                  className="input input-bordered font-mono"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Flake app output</span>
                <input
                  name="flakeOutput"
                  defaultValue={app.flake_output}
                  className="input input-bordered font-mono"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Health path</span>
                <input
                  name="healthPath"
                  defaultValue={app.health_path}
                  className="input input-bordered font-mono"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Restart policy</span>
                <select
                  name="restartPolicy"
                  defaultValue={app.restart_policy}
                  className="select select-bordered"
                >
                  <option>on-failure</option>
                  <option>always</option>
                  <option>unless-stopped</option>
                  <option>never</option>
                </select>
              </label>
            </div>
            <label className="form-control">
              <span className="label-text mb-1">Custom domains</span>
              <textarea
                name="domains"
                defaultValue={data.domains.join("\n")}
                className="textarea textarea-bordered font-mono"
                placeholder={"app.example.com\\nwww.example.net"}
              />
              <span className="mt-1 text-xs text-base-content/55">
                One per line or comma-separated. Cloudflare-managed zones are synchronized
                automatically; other DNS/TLS providers can proxy each hostname to this app&apos;s
                stable LAN port.
              </span>
            </label>
            <label className="label max-w-sm cursor-pointer">
              <span className="label-text">Automatically deploy production branch</span>
              <input
                name="autoDeploy"
                type="checkbox"
                defaultChecked={Boolean(app.auto_deploy)}
                className="toggle toggle-primary"
              />
            </label>
            <div>
              <button type="submit" disabled={busy === "settings"} className="btn btn-primary">
                Save settings
              </button>
            </div>
          </form>
          <div className="divider mt-10">Danger zone</div>
          <div className="flex items-center justify-between rounded-box border border-error/30 p-4">
            <div>
              <div className="font-bold">Delete application</div>
              <p className="text-sm text-base-content/60">
                Stops the process and removes NixHost metadata.
              </p>
            </div>
            <button
              type="button"
              disabled={busy === "delete"}
              className="btn btn-error btn-outline"
              onClick={() => void removeApp()}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <Link className="link" href="/apps">
          ← All applications
        </Link>
      </div>
    </>
  );
}
