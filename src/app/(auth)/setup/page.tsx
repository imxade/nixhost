import { redirect } from "next/navigation";
import { SetupForm } from "@/components/setup-form";
import { isSetupComplete } from "@/server/auth";

export const dynamic = "force-dynamic";
export default function SetupPage() {
  if (isSetupComplete()) redirect("/login");
  return <main className="min-h-screen grid place-items-center p-5"><section className="card w-full max-w-lg bg-base-100 shadow-xl"><SetupForm /></section></main>;
}
