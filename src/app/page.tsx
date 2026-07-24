import { redirect } from "next/navigation";
import { isSetupComplete } from "@/server/auth";
import { currentUser } from "@/server/next-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSetupComplete()) redirect("/setup");
  if (!(await currentUser())) redirect("/login");
  redirect("/apps");
}
