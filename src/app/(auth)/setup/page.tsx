import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SetupForm } from "@/components/setup-form";
import { isSetupComplete } from "@/server/auth";

export const dynamic = "force-dynamic";
export default function SetupPage() {
  if (isSetupComplete()) redirect("/login");
  return (
    <AuthShell>
      <SetupForm />
    </AuthShell>
  );
}
