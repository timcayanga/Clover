import { notFound } from "next/navigation";
import { z } from "zod";
import { requireInternalAccess } from "@/lib/internal-access";
import { getAssignment } from "@/lib/team-agent-store";
import { TeamAssignmentWorkspace } from "@/components/team-assignments";
import "../../studio.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Assignment · Clover Team",
  robots: { index: false, follow: false },
};
export default async function AssignmentPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const access = await requireInternalAccess();
  const parsed = z
    .string()
    .uuid()
    .safeParse((await params).runId);
  if (access.localPreview || !parsed.success) notFound();
  const run = await getAssignment(access.userId, parsed.data).catch((error) => {
    if (error instanceof Error && error.message === "ASSIGNMENT_NOT_FOUND")
      notFound();
    throw error;
  });
  return <TeamAssignmentWorkspace key={run.id} initial={run} />;
}
