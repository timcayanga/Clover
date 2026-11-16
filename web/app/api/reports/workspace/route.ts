import { authorizeReports, reportResponse } from "@/lib/reports-authorization";
import { reportViewFromParams } from "@/lib/report-view";
import { loadReportsWorkspace } from "@/lib/reports-workspace";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { user, workspaceId } = await authorizeReports(request);
    const view = reportViewFromParams(new URL(request.url).searchParams);
    return reportResponse(
      await loadReportsWorkspace(user.id, workspaceId, view),
    );
  } catch (error) {
    return reportResponse(
      {
        error:
          error instanceof Error && /Choose valid/.test(error.message)
            ? error.message
            : "Unable to load reports for this Profile. Please try again.",
      },
      400,
    );
  }
}
