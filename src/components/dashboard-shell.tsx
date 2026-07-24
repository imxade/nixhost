"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/client-api";

const items = [
  ["/apps", "Applications", "▦"],
  ["/deployments", "Deployments", "↻"],
  ["/integrations/github", "GitHub", "⌘"],
  ["/integrations/cloudflare", "Cloudflare", "☁"],
  ["/users", "Users", "♙"],
  ["/system", "System", "◉"],
] as const;

export function DashboardShell({ children, username, role }: { children: React.ReactNode; username: string; role: string }) {
  const pathname = usePathname(); const router = useRouter();
  async function logout() { await apiFetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
  return <div className="drawer lg:drawer-open min-h-screen">
    <input id="nixhost-drawer" type="checkbox" className="drawer-toggle" />
    <div className="drawer-content flex min-h-screen flex-col">
      <header className="navbar sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur lg:hidden">
        <label htmlFor="nixhost-drawer" className="btn btn-square btn-ghost" aria-label="Open navigation">☰</label>
        <span className="font-bold text-xl">NixHost</span>
      </header>
      <main className="flex-1 p-4 md:p-7 xl:p-10">{children}</main>
    </div>
    <aside className="drawer-side z-30">
      <label htmlFor="nixhost-drawer" aria-label="Close navigation" className="drawer-overlay" />
      <div className="flex min-h-full w-72 flex-col border-r border-base-300 bg-base-100 p-4">
        <Link href="/apps" className="flex items-center gap-3 px-3 py-4"><span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-content font-black">N</span><div><div className="text-xl font-bold">NixHost</div><div className="text-xs text-base-content/60">LAN deployment control plane</div></div></Link>
        <ul className="menu mt-4 gap-1 p-0">
          {items.filter(([href]) => href !== "/users" || role === "owner" || role === "admin").map(([href, label, icon]) => <li key={href}><Link href={href} className={pathname === href || (href !== "/apps" && pathname.startsWith(href)) || (href === "/apps" && pathname.startsWith("/apps")) ? "active" : ""}><span className="w-5 text-center">{icon}</span>{label}</Link></li>)}
        </ul>
        <div className="mt-auto border-t border-base-300 pt-4">
          <div className="px-3 py-2"><div className="font-medium">{username}</div><div className="text-xs uppercase tracking-wide text-base-content/60">{role}</div></div>
          <button className="btn btn-ghost btn-sm w-full justify-start" onClick={logout}>Sign out</button>
        </div>
      </div>
    </aside>
  </div>;
}
