import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminHomeBanners } from "@/components/admin-home-banners";
export const dynamic = "force-dynamic";
export default async function Page() {
  try { await requireAdminAuth(); } catch { redirect("/dashboard"); }
  return <AdminPageChrome active="home-banners" title="Home banners"><AdminHomeBanners /></AdminPageChrome>;
}
