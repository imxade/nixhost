export async function register(): Promise<void> {
  if (process.env.NIXHOST_DISABLE_RUNTIME === "1") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootRuntime } = await import("./src/server/runtime.js");
    await bootRuntime();
  }
}
