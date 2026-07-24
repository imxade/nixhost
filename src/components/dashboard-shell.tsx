"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";
import { ThemeToggle } from "./theme-toggle";

const items = [
  ["/apps", "Applications", "apps"],
  ["/deployments", "Deployments", "deployments"],
  ["/integrations/github", "GitHub", "github"],
  ["/integrations/cloudflare", "Cloudflare", "cloud"],
  ["/users", "Users", "users"],
  ["/system", "System", "system"],
] as const;

export function DashboardShell({
  children,
  username,
  role,
}: {
  children: React.ReactNode;
  username: string;
  role: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="drawer lg:drawer-open min-h-screen">
      <input id="nixhost-drawer" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex min-h-screen flex-col">
        <header className="navbar sticky top-0 z-20 gap-2 border-b border-base-300 bg-base-100/95 px-3 backdrop-blur lg:hidden">
          <label
            htmlFor="nixhost-drawer"
            className="btn btn-square btn-ghost"
            aria-label="Open navigation"
          >
            ☰
          </label>
          <span className="flex-1 text-xl font-bold tracking-tight">NixHost</span>
          <ThemeToggle compact />
        </header>
        <main className="mx-auto w-full max-w-[100rem] flex-1 p-4 md:p-7 xl:p-10">{children}</main>
      </div>
      <aside className="drawer-side z-30">
        <label htmlFor="nixhost-drawer" aria-label="Close navigation" className="drawer-overlay" />
        <div className="flex min-h-full w-72 flex-col border-r border-base-300 bg-base-100 p-4 shadow-xl lg:shadow-none">
          <Link href="/apps" className="flex items-center gap-3 px-3 py-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary font-black text-primary-content shadow-sm">
              N
            </span>
            <div>
              <div className="text-xl font-bold">NixHost</div>
              <div className="text-xs text-base-content/60">LAN deployment control plane</div>
            </div>
          </Link>
          <ul className="menu mt-4 gap-1 p-0">
            {items
              .filter(([href]) => href !== "/users" || role === "owner" || role === "admin")
              .map(([href, label, icon]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className={
                      pathname === href ||
                      (href !== "/apps" && pathname.startsWith(href)) ||
                      (href === "/apps" && pathname.startsWith("/apps"))
                        ? "active"
                        : ""
                    }
                  >
                    <NavIcon name={icon} />
                    {label}
                  </Link>
                </li>
              ))}
          </ul>
          <div className="mt-auto space-y-2 border-t border-base-300 pt-4">
            <ThemeToggle />
            <div className="rounded-lg bg-base-200/70 px-3 py-2.5">
              <div className="font-medium">{username}</div>
              <div className="text-xs uppercase tracking-wide text-base-content/60">{role}</div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm w-full justify-start"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}

type NavIconName = (typeof items)[number][2];

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    apps: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    deployments: (
      <>
        <path d="M20 7h-5V2" />
        <path d="M4 17h5v5" />
        <path d="M18.4 18A8 8 0 0 1 5.1 16.9" />
        <path d="M5.6 6A8 8 0 0 1 18.9 7.1" />
      </>
    ),
    github: (
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7.4A5.8 5.8 0 0 0 19.3 3 5.4 5.4 0 0 0 19.1-.9S17.9-1.3 15 1a13.4 13.4 0 0 0-6 0C6.1-1.3 4.9-.9 4.9-.9A5.4 5.4 0 0 0 4.7 3a5.8 5.8 0 0 0-1.5 4.1c0 5.8 3.5 7 6.8 7.4A4.8 4.8 0 0 0 9 18v4" />
    ),
    cloud: <path d="M17.5 19H6a4 4 0 0 1-.5-8A6.5 6.5 0 0 1 18 9a5 5 0 0 1-.5 10Z" />,
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    system: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 12h8M12 8v8" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
