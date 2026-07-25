export type AccessLink = {
  kind: "lan" | "temporary" | "custom";
  label: string;
  url: string;
  status: "available" | "starting" | "unavailable" | "configured";
  note: string | null;
};

export function AccessLinks({
  links,
  compact = false,
}: {
  links: AccessLink[];
  compact?: boolean;
}) {
  if (links.length === 0) {
    return <div className="text-sm text-base-content/55">No web access links for this worker.</div>;
  }
  return (
    <div className={compact ? "grid gap-2" : "grid gap-3"}>
      {links.map((link) => (
        <div
          key={`${link.kind}:${link.url || link.label}`}
          className={
            compact
              ? "flex min-w-0 items-center gap-2"
              : "rounded-box border border-base-300 bg-base-100 p-3"
          }
        >
          <div className={compact ? "min-w-0 flex-1" : "flex flex-wrap items-start gap-3"}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{link.label}</span>
                <span className={`badge badge-sm ${statusClass(link.status)}`}>{link.status}</span>
              </div>
              {link.url ? (
                <a
                  className="link mt-1 block truncate font-mono text-xs"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  title={link.url}
                >
                  {link.url}
                </a>
              ) : (
                <div className="mt-1 text-xs text-base-content/55">URL not available yet</div>
              )}
              {!compact && link.note && (
                <div className="mt-1 text-xs text-base-content/55">{link.note}</div>
              )}
            </div>
            {!compact && link.url && (
              <a
                className="btn btn-sm"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Open ${link.label}`}
              >
                Open
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function statusClass(status: AccessLink["status"]): string {
  if (status === "available") return "badge-success";
  if (status === "starting") return "badge-warning";
  if (status === "configured") return "badge-info";
  return "badge-error badge-outline";
}
