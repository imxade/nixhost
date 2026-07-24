import { AppDetailClient } from "@/components/app-detail-client";
export const metadata = { title: "Application" };
export default async function AppPage({ params }: { params: Promise<{ id: string }> }) { const {id}=await params; return <AppDetailClient appId={id}/>; }
