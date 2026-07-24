import { redirect } from "next/navigation";
import { syncInstallations } from "@/server/github";
import { requirePageUser } from "@/server/next-auth";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requirePageUser();
  const { error } = await searchParams;
  let failure = error;
  if (!failure) {
    try {
      await syncInstallations();
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : "GitHub installation sync failed";
    }
  }
  if (!failure) redirect("/integrations/github");
  return (
    <main className="min-h-screen grid place-items-center p-5">
      <div className="card bg-base-100 shadow-xl max-w-lg">
        <div className="card-body">
          <h1 className="card-title">GitHub connection failed</h1>
          <div className="alert alert-error">{failure}</div>
          <a href="/integrations/github" className="btn btn-primary">
            Return to GitHub settings
          </a>
        </div>
      </div>
    </main>
  );
}
