import type { CloudflareDomainRoute } from "./cloudflare.ts";
import { lanHttpUrls } from "./network.ts";
import type { QuickTunnelRoute } from "./quick-tunnels.ts";

export type AccessLinkKind = "lan" | "temporary" | "custom";
export type AccessLinkStatus = "available" | "starting" | "unavailable" | "configured";

export interface AccessLink {
  kind: AccessLinkKind;
  label: string;
  url: string;
  status: AccessLinkStatus;
  note: string | null;
}

export function dashboardAccessLinks(input: {
  port: number;
  quickTunnel: QuickTunnelRoute | null;
  customHostname: string | null;
  namedTunnelEnabled: boolean;
  namedTunnelRunning: boolean;
}): AccessLink[] {
  const links: AccessLink[] = lanHttpUrls(input.port).map((url, index) => ({
    kind: "lan",
    label: index === 0 ? "Dashboard on LAN" : `Dashboard on LAN ${index + 1}`,
    url,
    status: "available",
    note: "Reachable only from the same local network.",
  }));
  if (input.quickTunnel?.url) {
    links.push({
      kind: "temporary",
      label: "Temporary dashboard URL",
      url: input.quickTunnel.url,
      status: input.quickTunnel.running ? "available" : "unavailable",
      note: "Changes only when this Quick Tunnel process must be recreated.",
    });
  } else if (input.quickTunnel) {
    links.push({
      kind: "temporary",
      label: "Temporary dashboard URL",
      url: "",
      status: input.quickTunnel.status === "starting" ? "starting" : "unavailable",
      note: input.quickTunnel.lastError ?? "Cloudflare is preparing the temporary URL.",
    });
  }
  if (input.customHostname) {
    links.push({
      kind: "custom",
      label: "Dashboard custom domain",
      url: `https://${input.customHostname}`,
      status:
        input.namedTunnelEnabled && input.namedTunnelRunning
          ? "available"
          : input.namedTunnelEnabled
            ? "starting"
            : "configured",
      note: input.namedTunnelEnabled
        ? "Managed by the persistent named tunnel."
        : "Configured, but the named tunnel is disabled.",
    });
  }
  return links;
}

export function applicationAccessLinks(input: {
  appName: string;
  publicPort: number | null;
  applicationStatus: string;
  quickTunnel: QuickTunnelRoute | null;
  customRoutes: CloudflareDomainRoute[];
  namedTunnelEnabled: boolean;
  namedTunnelRunning: boolean;
}): AccessLink[] {
  if (!input.publicPort) return [];
  const serviceStatus = applicationLinkStatus(input.applicationStatus);
  const serviceNote =
    serviceStatus === "available"
      ? null
      : serviceStatus === "starting"
        ? `The application is currently ${input.applicationStatus}.`
        : `The URL is configured, but the application is ${input.applicationStatus}.`;
  const links: AccessLink[] = lanHttpUrls(input.publicPort).map((url, index) => ({
    kind: "lan",
    label: index === 0 ? `${input.appName} on LAN` : `${input.appName} on LAN ${index + 1}`,
    url,
    status: serviceStatus,
    note: serviceNote ?? "Reachable only from the same local network.",
  }));
  if (input.quickTunnel?.url) {
    const tunnelReady = input.quickTunnel.running;
    links.push({
      kind: "temporary",
      label: "Temporary public URL",
      url: input.quickTunnel.url,
      status: tunnelReady ? serviceStatus : "unavailable",
      note: tunnelReady
        ? (serviceNote ??
          "Remains active alongside custom domains while the tunnel process survives.")
        : (input.quickTunnel.lastError ?? "The temporary tunnel is not running."),
    });
  } else if (input.quickTunnel) {
    links.push({
      kind: "temporary",
      label: "Temporary public URL",
      url: "",
      status: input.quickTunnel.status === "starting" ? "starting" : "unavailable",
      note: input.quickTunnel.lastError ?? "Cloudflare is preparing the temporary URL.",
    });
  }
  for (const route of input.customRoutes) {
    const routeReady =
      route.status === "managed" && input.namedTunnelEnabled && input.namedTunnelRunning;
    const routeStarting =
      route.status === "pending" || (route.status === "managed" && input.namedTunnelEnabled);
    links.push({
      kind: "custom",
      label: route.hostname,
      url: `https://${route.hostname}`,
      status: routeReady
        ? serviceStatus
        : routeStarting
          ? "starting"
          : route.status === "managed"
            ? "configured"
            : "unavailable",
      note:
        route.status === "external"
          ? "DNS is not managed by this Cloudflare connection."
          : (route.lastError ?? (routeReady ? serviceNote : null)),
    });
  }
  return links;
}

function applicationLinkStatus(status: string): AccessLinkStatus {
  if (status === "running") return "available";
  if (
    [
      "queued",
      "preparing",
      "fetching",
      "evaluating",
      "starting",
      "health-checking",
      "activating",
    ].includes(status)
  ) {
    return "starting";
  }
  return "unavailable";
}
