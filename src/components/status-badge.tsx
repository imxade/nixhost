export function StatusBadge({ state }: { state: string }) {
  const positive = ["running", "processed", "active", "connected"].includes(state);
  const pending = [
    "queued",
    "preparing",
    "fetching",
    "evaluating",
    "starting",
    "health-checking",
    "activating",
  ].includes(state);
  const cls = positive
    ? "badge-success"
    : pending
      ? "badge-warning"
      : state === "stopped" || state === "superseded"
        ? "badge-ghost"
        : "badge-error";
  return <span className={`badge ${cls} badge-sm font-medium`}>{state}</span>;
}
