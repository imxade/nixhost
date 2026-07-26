export type QuickTunnelState = {
  status: string;
  running: boolean;
  url: string | null;
  lastError: string | null;
};

export function QuickTunnelNotice({
  route,
  activeMessage,
}: {
  route: QuickTunnelState | null;
  activeMessage: string;
}) {
  if (!route) return null;
  if (route.running && route.url) {
    return <div className="alert alert-warning mt-3 text-sm">{activeMessage}</div>;
  }
  if (route.status === "starting") {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-base-content/60">
        <span className="loading loading-spinner loading-xs" />
        Preparing temporary public URL…
      </div>
    );
  }
  return (
    <div className="alert alert-error mt-3 text-sm">
      <span>
        Temporary public URL unavailable
        {route.lastError ? `: ${route.lastError}` : "."}
      </span>
    </div>
  );
}
