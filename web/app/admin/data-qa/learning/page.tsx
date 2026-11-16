import { redirect } from "next/navigation";
import { requireAdminAuth } from "@/lib/admin";
import { AdminPageChrome } from "@/components/admin-page-chrome";
import { AdminLearningJobs } from "@/components/admin-learning-jobs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Learning jobs" };
export default async function LearningJobsPage() {
  try { await requireAdminAuth(); } catch { redirect("/dashboard"); }
  return <AdminPageChrome active="data-qa" title="Learning jobs" kicker="Data QA" subtitle="Review saved learning progress, failures and retries."><AdminLearningJobs /></AdminPageChrome>;
}
