import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { isSetupComplete } from "@/server/auth";
import { currentUser } from "@/server/next-auth";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (!isSetupComplete()) redirect("/setup");
  if (await currentUser()) redirect("/apps");
  return <main className="min-h-screen grid place-items-center p-5"><section className="card w-full max-w-md bg-base-100 shadow-xl"><LoginForm /></section></main>;
}
