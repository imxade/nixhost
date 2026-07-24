import type { NextRequest } from "next/server";
import { requireRole } from "@/server/auth";
import { api,readJson } from "@/server/http";
import { clientIp,requestUser } from "@/server/next-auth";
import { createUser,listUsers } from "@/server/user-service";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request:NextRequest){return api(request,()=>{const user=requestUser(request);requireRole(user,["owner","admin"]);return listUsers()})}
export async function POST(request:NextRequest){return api(request,async()=>{const user=requestUser(request);requireRole(user,["owner","admin"]);return createUser(await readJson(request),{id:user.id,ip:clientIp(request)})})}
