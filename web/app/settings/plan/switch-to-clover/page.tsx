import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { CloverShell } from "@/components/clover-shell";
import { SwitchApplication } from "@/components/switch-campaign";
export const dynamic="force-dynamic";
export default async function Page(){const {userId}=await auth();if(!userId)redirect("/sign-in?campaign=switch-to-clover");return <CloverShell active="settings" title="Switch to Clover" mobileBackHref="/settings/plan"><SwitchApplication/></CloverShell>;}
