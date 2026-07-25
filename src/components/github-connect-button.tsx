"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/client-api";

export function GitHubConnectButton({
  className = "btn btn-primary",
  label = "Connect GitHub",
  onError,
}: {
  className?: string;
  label?: string;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    try {
      const result = await apiFetch<{ action: string; manifest: string }>("/api/github/manifest");
      const form = document.createElement("form");
      form.method = "POST";
      form.action = result.action;
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "manifest";
      field.value = result.manifest;
      form.appendChild(field);
      document.body.appendChild(form);
      form.submit();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "Could not connect GitHub");
      setBusy(false);
    }
  }

  return (
    <button type="button" disabled={busy} className={className} onClick={() => void connect()}>
      {busy ? <span className="loading loading-spinner" /> : label}
    </button>
  );
}
