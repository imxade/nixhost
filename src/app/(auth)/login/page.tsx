import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/login-form";
import { isSetupComplete } from "@/server/auth";
import { currentUser } from "@/server/next-auth";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (!isSetupComplete()) redirect("/setup");
  if (await currentUser()) redirect("/apps");
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
