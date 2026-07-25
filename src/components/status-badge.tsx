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
  const neutral = ["stopped", "superseded", "not-deployed", "cancelled"].includes(state);
  const cls = positive
    ? "badge-success"
    : pending
      ? "badge-warning"
      : neutral
        ? "badge-ghost"
        : "badge-error";
  const label = state.replaceAll("-", " ");
  return <span className={`badge ${cls} badge-sm font-medium`}>{label}</span>;
}
