"use client";
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { apiFetch, formatDate } from "@/lib/client-api";
import { PageHeading } from "./page-heading";
import { StatusBadge } from "./status-badge";

type App = { id: string; name: string; slug: string; kind: "web"|"worker"; repository_url: string; branch: string; flake_output: string; auto_deploy: number; desired_state: string; public_port: number|null; active_deployment_id: string|null; domain?: string|null; updated_at: string };
type Repository = { id: number; full_name: string; clone_url: string; default_branch: string; installation_id: number; private: boolean };
type GitHubStatus = { connected: boolean };

export function AppsClient() {
  const [apps, setApps] = useState<App[]>([]); const [repositories, setRepositories] = useState<Repository[]>([]);
  const [github, setGithub] = useState<GitHubStatus>({ connected: false }); const [error, setError] = useState("");
  const [busy, setBusy] = useState(false); const [search, setSearch] = useState("");
  async function load() {
    setError("");
    try {
      const [appRows, status] = await Promise.all([apiFetch<App[]>("/api/apps"), apiFetch<GitHubStatus>("/api/github/status")]);
      setApps(appRows); setGithub(status);
      if (status.connected) setRepositories(await apiFetch<Repository[]>("/api/github/repositories"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load applications"); }
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => apps.filter((app) => `${app.name} ${app.repository_url}`.toLowerCase().includes(search.toLowerCase())), [apps, search]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const selected = repositories.find((repo) => String(repo.id) === String(form.get("repositoryId")));
    const repositoryUrl = selected?.clone_url || String(form.get("repositoryUrl") || "");
    try {
      const app = await apiFetch<App>("/api/apps", { method: "POST", body: JSON.stringify({ name: form.get("name"), repositoryUrl, branch: form.get("branch") || selected?.default_branch || "main", flakeOutput: form.get("flakeOutput") || "default", kind: form.get("kind") || "web", healthPath: form.get("healthPath") || "/", githubRepositoryId: selected?.id ?? null, githubInstallationId: selected?.installation_id ?? null, autoDeploy: true }) });
      await apiFetch(`/api/apps/${app.id}/deploy`, { method: "POST", body: "{}" });
      (document.getElementById("new-app") as HTMLDialogElement | null)?.close();
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Application creation failed"); }
    finally { setBusy(false); }
  }
  return <>
    <PageHeading title="Applications" description="Import a repository containing flake.nix and flake.lock. NixHost builds the selected flake app, supervises it, and keeps its LAN endpoint stable." actions={<button className="btn btn-primary" onClick={() => (document.getElementById("new-app") as HTMLDialogElement).showModal()}>New application</button>} />
    {error && <div className="alert alert-error mb-5"><span>{error}</span><button className="btn btn-sm" onClick={() => void load()}>Retry</button></div>}
    <div className="mb-5 flex items-center gap-3"><input className="input input-bordered w-full max-w-md" placeholder="Search applications" value={search} onChange={(e) => setSearch(e.target.value)} /><button className="btn btn-ghost" onClick={() => void load()}>Refresh</button></div>
    {filtered.length === 0 ? <div className="hero min-h-[40vh] rounded-box border border-dashed border-base-300 bg-base-100"><div className="hero-content text-center"><div><h2 className="text-2xl font-bold">No applications yet</h2><p className="mt-2 text-base-content/65">Connect GitHub or import a public HTTPS repository.</p><button className="btn btn-primary mt-5" onClick={() => (document.getElementById("new-app") as HTMLDialogElement).showModal()}>Import repository</button></div></div></div> :
      <div className="grid gap-4 xl:grid-cols-2">{filtered.map((app) => <Link key={app.id} href={`/apps/${app.id}`} className="card border border-base-300 bg-base-100 transition hover:-translate-y-0.5 hover:shadow-lg"><div className="card-body"><div className="flex items-start justify-between gap-3"><div><h2 className="card-title">{app.name}</h2><p className="mt-1 text-sm text-base-content/60">{app.repository_url.replace(/^https:\/\//, "")}</p></div><StatusBadge state={app.active_deployment_id ? "running" : app.desired_state} /></div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="text-base-content/55">Branch</span><div className="font-mono">{app.branch}</div></div><div><span className="text-base-content/55">Flake app</span><div className="font-mono">#{app.flake_output}</div></div><div><span className="text-base-content/55">LAN endpoint</span><div>{app.public_port ? `:${app.public_port}` : "Worker"}</div></div><div><span className="text-base-content/55">Updated</span><div>{formatDate(app.updated_at)}</div></div></div>{app.domain && <div className="badge badge-outline mt-2">{app.domain}</div>}</div></Link>)}</div>}

    <dialog id="new-app" className="modal"><div className="modal-box max-w-2xl"><form method="dialog"><button className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button></form><h3 className="text-2xl font-bold">Import application</h3><p className="mt-2 text-base-content/65">The repository must expose a runnable flake app for this host system.</p><form onSubmit={create} className="mt-6 grid gap-4">
      <label className="form-control"><span className="label-text mb-1">Application name</span><input name="name" required className="input input-bordered" placeholder="My API" /></label>
      {github.connected && repositories.length > 0 ? <label className="form-control"><span className="label-text mb-1">GitHub repository</span><select name="repositoryId" className="select select-bordered" defaultValue=""><option value="" disabled>Select repository</option>{repositories.map((repo) => <option value={repo.id} key={repo.id}>{repo.full_name}{repo.private ? " · private" : ""}</option>)}</select></label> : <label className="form-control"><span className="label-text mb-1">GitHub repository URL</span><input name="repositoryUrl" type="url" required className="input input-bordered" placeholder="https://github.com/owner/repository.git" /></label>}
      <div className="grid gap-4 md:grid-cols-2"><label className="form-control"><span className="label-text mb-1">Branch</span><input name="branch" className="input input-bordered" placeholder="main (repository default when GitHub connected)" /></label><label className="form-control"><span className="label-text mb-1">Flake app output</span><input name="flakeOutput" className="input input-bordered font-mono" defaultValue="default" /></label></div>
      <div className="grid gap-4 md:grid-cols-2"><label className="form-control"><span className="label-text mb-1">Application type</span><select name="kind" className="select select-bordered"><option value="web">Web application</option><option value="worker">Worker / bot</option></select></label><label className="form-control"><span className="label-text mb-1">Health path</span><input name="healthPath" className="input input-bordered font-mono" defaultValue="/" /></label></div>
      <div className="alert"><span>Importing executes trusted repository code through Nix. Do not deploy repositories you do not control or trust.</span></div>
      <div className="modal-action"><button type="button" className="btn" onClick={() => (document.getElementById("new-app") as HTMLDialogElement).close()}>Cancel</button><button disabled={busy} className="btn btn-primary">{busy ? <span className="loading loading-spinner" /> : "Import and deploy"}</button></div>
    </form></div><form method="dialog" className="modal-backdrop"><button>close</button></form></dialog>
  </>;
}
