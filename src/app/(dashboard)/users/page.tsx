import { redirect } from "next/navigation";
import { UsersClient } from "@/components/users-client";
import { requirePageUser } from "@/server/next-auth";
export const metadata={title:"Users"};export default async function Page(){const user=await requirePageUser();if(!["owner","admin"].includes(user.role))redirect("/apps");return <UsersClient/>}
