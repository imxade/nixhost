"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/setup/complete", { method: "POST", body: JSON.stringify({ token: data.get("token"), username: data.get("username"), password: data.get("password") }) });
      router.replace("/apps"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Setup failed"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="card-body gap-4">
    <div><h1 className="card-title text-3xl">Claim this NixHost</h1><p className="text-base-content/70 mt-2">Enter the one-time token printed by the local process, then create the owner account.</p></div>
    {error && <div className="alert alert-error"><span>{error}</span></div>}
    <label className="form-control"><span className="label-text mb-1">Setup token</span><input name="token" required autoComplete="one-time-code" className="input input-bordered font-mono" /></label>
    <label className="form-control"><span className="label-text mb-1">Owner username</span><input name="username" required minLength={3} autoComplete="username" className="input input-bordered" /></label>
    <label className="form-control"><span className="label-text mb-1">Password</span><input name="password" required minLength={12} type="password" autoComplete="new-password" className="input input-bordered" /><span className="label-text-alt mt-1">At least 12 characters.</span></label>
    <button disabled={busy} className="btn btn-primary">{busy ? <span className="loading loading-spinner" /> : "Create owner account"}</button>
  </form>;
}
