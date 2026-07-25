import os from "node:os";

export function lanHttpUrls(port: number): string[] {
  const addresses = new Set<string>();
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.internal) continue;
      const family = typeof address.family === "string" ? address.family : String(address.family);
      if (family === "IPv4") addresses.add(`http://${address.address}:${port}`);
      else if (family === "IPv6" && !address.address.includes("%")) {
        addresses.add(`http://[${address.address}]:${port}`);
      }
    }
  }
  return [...addresses].sort((a, b) => {
    const aIpv4 = !a.includes("[");
    const bIpv4 = !b.includes("[");
    return aIpv4 === bIpv4 ? a.localeCompare(b) : aIpv4 ? -1 : 1;
  });
}
