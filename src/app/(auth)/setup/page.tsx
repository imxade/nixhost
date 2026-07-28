import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "@/components/setup-form";
import { isSetupComplete, setupTokenIsValid } from "@/server/auth";
import { SETUP_COOKIE } from "@/server/next-auth";

export const dynamic = "force-dynamic";
export default async function SetupPage() {
  if (isSetupComplete()) redirect("/login");
  const cookieStore = await cookies();
  const authorized = setupTokenIsValid(cookieStore.get(SETUP_COOKIE)?.value);
  return (
    <AuthShell>
      <SetupForm authorized={authorized} />
    </AuthShell>
  );
}
