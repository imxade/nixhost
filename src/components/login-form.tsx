"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

export function LoginForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const data = new FormData(event.currentTarget);
    try { await apiFetch("/api/auth/login", { method: "POST", body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) }); router.replace("/apps"); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed"); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="card-body gap-4">
    <div><h1 className="card-title text-3xl">Sign in</h1><p className="text-base-content/70 mt-2">Manage applications hosted by this device.</p></div>
    {error && <div className="alert alert-error"><span>{error}</span></div>}
    <label className="form-control"><span className="label-text mb-1">Username</span><input name="username" autoComplete="username" required className="input input-bordered" /></label>
    <label className="form-control"><span className="label-text mb-1">Password</span><input name="password" type="password" autoComplete="current-password" required className="input input-bordered" /></label>
    <button disabled={busy} className="btn btn-primary">{busy ? <span className="loading loading-spinner" /> : "Sign in"}</button>
  </form>;
}
