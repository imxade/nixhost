import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NixHost", template: "%s · NixHost" },
  description: "LAN-first control plane for trusted Nix flake deployments.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className="bg-base-200 text-base-content">{children}</body></html>;
}
