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
    return <div className="text-sm text-base-content/55">No access URL is available.</div>;
  }
  return (
    <div className={compact ? "grid min-w-0 gap-2" : "grid min-w-0 gap-3"}>
      {links.map((link) => (
        <div
          key={`${link.kind}:${link.url || link.label}`}
          className={
            compact
              ? "flex min-w-0 max-w-full items-center gap-2"
              : "rounded-box min-w-0 max-w-full overflow-hidden border border-base-300 bg-base-100 p-3"
          }
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{link.label}</span>
              {link.status !== "available" && (
                <span className={`badge badge-sm ${statusClass(link.status)}`}>{link.status}</span>
              )}
            </div>
            {link.status === "available" ? (
              <a
                className="link mt-1 block max-w-full break-all font-mono text-xs"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                title={link.url}
              >
                {link.url}
              </a>
            ) : (
              <div className="mt-1 break-all font-mono text-xs text-base-content/55">
                {link.url}
              </div>
            )}
            {!compact && link.note && (
              <div className="mt-1 text-xs text-base-content/55">{link.note}</div>
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
