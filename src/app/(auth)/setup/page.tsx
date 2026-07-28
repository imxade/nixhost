import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "@/components/setup-form";
import { isSetupComplete, setupTokenIsValid } from "@/server/auth";
import { SETUP_COOKIE } from "@/server/next-auth";

export const dynamic = "force-dynamic";
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (isSetupComplete()) redirect("/login");
  const cookieStore = await cookies();
  const authorized = setupTokenIsValid(cookieStore.get(SETUP_COOKIE)?.value);
  const query = await searchParams;
  return (
    <AuthShell>
      <SetupForm
        authorized={authorized}
        initialError={
          query.error
            ? "Account creation failed. Check the fields or open the first-run link again."
            : ""
        }
      />
    </AuthShell>
  );
}
