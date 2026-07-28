import { AccountClient } from "@/components/account-client";
import { requirePageUser } from "@/server/next-auth";

export const metadata = { title: "Account" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwordChanged?: string }>;
}) {
  const user = await requirePageUser();
  const query = await searchParams;
  return (
    <AccountClient
      username={user.username}
      role={user.role}
      initialError={
        query.error ? "Password change failed. Check your current and new passwords." : ""
      }
      initialMessage={
        query.passwordChanged ? "Password changed. Other signed-in sessions were logged out." : ""
      }
    />
  );
}
