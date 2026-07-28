import { AccountClient } from "@/components/account-client";
import { requirePageUser } from "@/server/next-auth";

export const metadata = { title: "Account" };

export default async function Page() {
  const user = await requirePageUser();
  return <AccountClient username={user.username} role={user.role} />;
}
