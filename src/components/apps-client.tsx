"use client";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatDate } from "@/lib/client-api";
import { type AccessLink, AccessLinks } from "./access-links";
import { GitHubConnectButton } from "./github-connect-button";
import { PageHeading } from "./page-heading";
import { type GitHubRepositoryOption, RepositoryPicker } from "./repository-picker";
import { StatusBadge } from "./status-badge";

type App = {
  id: string;
  name: string;
  slug: string;
  kind: "web" | "worker";
  repository_url: string;
  branch: string;
  flake_output: string;
  auto_deploy: number;
  public_port: number | null;
  active_deployment_id: string | null;
  operationalStatus: string;
  accessLinks: AccessLink[];
  domain?: string | null;
  updated_at: string;
};
type GitHubStatus = {
  connected: boolean;
  canManage: boolean;
  app: null | { installUrl: string };
};
type RepositorySource = "github" | "public";

export function AppsClient() {
  const [apps, setApps] = useState<App[]>([]);
  const [repositories, setRepositories] = useState<GitHubRepositoryOption[]>([]);
  const [github, setGithub] = useState<GitHubStatus>({
    connected: false,
    canManage: false,
    app: null,
  });
  const [repositorySource, setRepositorySource] = useState<RepositorySource>("github");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<number | null>(null);
  const [repositoriesLoaded, setRepositoriesLoaded] = useState(false);
  const [repositoriesLoading, setRepositoriesLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const [appRows, status] = await Promise.all([
        apiFetch<App[]>("/api/apps"),
        apiFetch<GitHubStatus>("/api/github/status"),
      ]);
      setApps(appRows);
      setGithub(status);
      if (!status.connected) {
        setRepositories([]);
        setRepositoriesLoaded(false);
        setSelectedRepositoryId(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load applications");
    } finally {
      setLoaded(true);
    }
  }, []);
  useEffect(() => {
    void load();
    const source = new EventSource("/api/events");
    source.addEventListener("deployment.state", () => void load());
    source.addEventListener("deployment.queued", () => void load());
    source.addEventListener("application.stopped", () => void load());
    source.addEventListener("quick_tunnel.ready", () => void load());
    source.addEventListener("quick_tunnel.stopped", () => void load());
    const interval = setInterval(() => void load(), 5000);
    return () => {
      source.close();
      clearInterval(interval);
    };
  }, [load]);
  const loadRepositories = useCallback(async () => {
    setRepositoriesLoading(true);
    setRepositoryError("");
    try {
      setRepositories(await apiFetch<GitHubRepositoryOption[]>("/api/github/repositories"));
      setRepositoriesLoaded(true);
    } catch (cause) {
      setRepositoryError(
        cause instanceof Error ? cause.message : "Could not load GitHub repositories",
      );
    } finally {
      setRepositoriesLoading(false);
    }
  }, []);
  function openImportDialog() {
    (document.getElementById("new-app") as HTMLDialogElement).showModal();
    if (
      github.connected &&
      repositorySource === "github" &&
      !repositoriesLoaded &&
      !repositoriesLoading
    ) {
      void loadRepositories();
    }
  }
  function selectRepositorySource(source: RepositorySource) {
    setRepositorySource(source);
    if (source === "github" && github.connected && !repositoriesLoaded && !repositoriesLoading) {
      void loadRepositories();
    }
  }
  const filtered = useMemo(
    () =>
      apps.filter((app) =>
        `${app.name} ${app.repository_url}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [apps, search],
  );
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const selected =
      repositorySource === "github"
        ? repositories.find((repo) => repo.id === selectedRepositoryId)
        : undefined;
    const repositoryUrl = selected?.clone_url || String(form.get("repositoryUrl") || "");
    try {
      await apiFetch<App>("/api/apps", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          repositoryUrl,
          branch: form.get("branch") || selected?.default_branch || undefined,
          flakeOutput: form.get("flakeOutput") || "default",
          kind: form.get("kind") || "web",
          healthPath: form.get("healthPath") || "/",
          githubRepositoryId: selected?.id ?? null,
          githubInstallationId: selected?.installation_id ?? null,
          autoDeploy: true,
        }),
      });
      (document.getElementById("new-app") as HTMLDialogElement | null)?.close();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Application creation failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="Applications"
        description="Import a locked Nix flake. NixHost deploys it, supervises it, and shows its available access URLs."
        actions={
          loaded ? (
            <>
              {!github.connected && github.canManage && <GitHubConnectButton onError={setError} />}
              {apps.length > 0 && (
                <button
                  type="button"
                  className={`btn ${github.connected ? "btn-primary" : ""}`}
                  onClick={openImportDialog}
                >
                  New application
                </button>
              )}
            </>
          ) : undefined
        }
      />
      {error && (
        <div className="alert alert-error mb-5">
          <span>{error}</span>
          <button type="button" className="btn btn-sm" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}
      {apps.length > 0 && (
        <div className="mb-5">
          <input
            className="input input-bordered w-full max-w-md bg-base-100"
            placeholder="Search applications"
            aria-label="Search applications"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      {!loaded ? (
        <div
          role="status"
          className="grid min-h-[40vh] place-items-center"
          aria-label="Loading applications"
        >
          <span className="loading loading-spinner loading-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="hero min-h-[40vh] rounded-box border border-dashed border-base-300 bg-base-100">
          <div className="hero-content text-center">
            <div>
              <h2 className="text-2xl font-bold">
                {apps.length === 0 ? "Deploy your first application" : "No matching applications"}
              </h2>
              <p className="mt-2 text-base-content/65">
                {apps.length === 0
                  ? "Connect GitHub or import a trusted public repository containing a locked Nix flake."
                  : "Try a different application name or repository."}
              </p>
              {apps.length === 0 && (
                <button type="button" className="btn btn-primary mt-5" onClick={openImportDialog}>
                  Import repository
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((app) => (
            <article
              key={app.id}
              className="card border border-base-300 bg-base-100 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="card-body">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link className="card-title link-hover" href={`/apps/${app.id}`}>
                      {app.name}
                    </Link>
                    <p className="mt-1 truncate text-sm text-base-content/60">
                      {app.repository_url.replace(/^https:\/\//, "")}
                    </p>
                  </div>
                  <StatusBadge state={app.operationalStatus} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-base-content/55">Branch</span>
                    <div className="font-mono">{app.branch}</div>
                  </div>
                  <div>
                    <span className="text-base-content/55">Flake app</span>
                    <div className="font-mono">#{app.flake_output}</div>
                  </div>
                  <div>
                    <span className="text-base-content/55">Type</span>
                    <div>{app.kind === "web" ? "Web service" : "Worker"}</div>
                  </div>
                  <div>
                    <span className="text-base-content/55">Updated</span>
                    <div>{formatDate(app.updated_at)}</div>
                  </div>
                </div>
                {app.kind === "web" && (
                  <div className="mt-3 border-t border-base-300 pt-3">
                    <AccessLinks links={app.accessLinks} compact />
                  </div>
                )}
                <div className="card-actions mt-2 justify-end">
                  <Link className="btn btn-sm" href={`/apps/${app.id}`}>
                    Manage
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <dialog id="new-app" className="modal">
        <div className="modal-box max-w-2xl">
          <form method="dialog">
            <button
              type="submit"
              className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
            >
              ✕
            </button>
          </form>
          <h3 className="text-2xl font-bold">Import application</h3>
          <p className="mt-2 text-base-content/65">
            The repository must expose a runnable flake app for this host system.
          </p>
          <form method="post" onSubmit={create} className="mt-6 grid gap-4">
            <label className="form-control">
              <span className="label-text mb-1">Application name</span>
              <input name="name" required className="input input-bordered" placeholder="My API" />
            </label>
            {github.connected && (
              <fieldset className="join grid grid-cols-2">
                <legend className="sr-only">Repository source</legend>
                <button
                  type="button"
                  className={`btn join-item ${repositorySource === "github" ? "btn-active" : ""}`}
                  aria-pressed={repositorySource === "github"}
                  onClick={() => selectRepositorySource("github")}
                >
                  GitHub access
                </button>
                <button
                  type="button"
                  className={`btn join-item ${repositorySource === "public" ? "btn-active" : ""}`}
                  aria-pressed={repositorySource === "public"}
                  onClick={() => selectRepositorySource("public")}
                >
                  Public URL
                </button>
              </fieldset>
            )}
            {github.connected &&
            repositorySource === "github" &&
            (repositoriesLoading || !repositoriesLoaded) ? (
              <div
                role="status"
                className="grid min-h-32 place-items-center"
                aria-label="Loading GitHub repositories"
              >
                {repositoryError ? (
                  <div className="alert alert-error">
                    <span>{repositoryError}</span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void loadRepositories()}
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <span className="loading loading-spinner loading-lg" />
                )}
              </div>
            ) : github.connected && repositorySource === "github" && repositories.length > 0 ? (
              <RepositoryPicker
                repositories={repositories}
                selectedId={selectedRepositoryId}
                installUrl={github.app?.installUrl}
                onSelect={setSelectedRepositoryId}
              />
            ) : (
              <>
                {github.connected && repositorySource === "github" && (
                  <div className="alert">
                    <span>
                      This GitHub App cannot access any repositories yet. Grant repository access,
                      then refresh this page.
                    </span>
                    {github.app?.installUrl && (
                      <a className="btn btn-sm" href={github.app.installUrl}>
                        Manage access
                      </a>
                    )}
                  </div>
                )}
                <label className="form-control">
                  <span className="label-text mb-1">Public GitHub repository URL</span>
                  <input
                    name="repositoryUrl"
                    type="url"
                    required
                    className="input input-bordered"
                    placeholder="https://github.com/owner/repository.git"
                  />
                  <span className="label-text-alt">
                    Cloned without GitHub App credentials. Private repositories require GitHub
                    access.
                  </span>
                </label>
              </>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Branch</span>
                <input
                  name="branch"
                  className="input input-bordered"
                  placeholder="Repository default (main fallback)"
                />
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Flake app output</span>
                <input
                  name="flakeOutput"
                  className="input input-bordered font-mono"
                  defaultValue="default"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control">
                <span className="label-text mb-1">Application type</span>
                <select name="kind" className="select select-bordered">
                  <option value="web">Web application</option>
                  <option value="worker">Worker / bot</option>
                </select>
              </label>
              <label className="form-control">
                <span className="label-text mb-1">Health path</span>
                <input
                  name="healthPath"
                  className="input input-bordered font-mono"
                  defaultValue="/"
                />
              </label>
            </div>
            <div className="alert">
              <span>
                Importing executes trusted repository code through Nix. Do not deploy repositories
                you do not control or trust.
              </span>
            </div>
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => (document.getElementById("new-app") as HTMLDialogElement).close()}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  (github.connected &&
                    repositorySource === "github" &&
                    (!repositoriesLoaded ||
                      (repositories.length > 0 && selectedRepositoryId === null)))
                }
                className="btn btn-primary"
              >
                {busy ? <span className="loading loading-spinner" /> : "Import and deploy"}
              </button>
            </div>
          </form>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </>
  );
}
