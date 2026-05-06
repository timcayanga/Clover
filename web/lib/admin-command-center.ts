import type { AdminDataQaSummaryResponse } from "@/lib/admin-data-qa-summary";
import type { AdminErrorLogListResponse } from "@/lib/admin-error-logs";
import type { AdminUserListResponse } from "@/lib/admin-users";
import type { AppBuildInfo } from "@/lib/build-info";
import { getAppBuildInfo } from "@/lib/build-info";
import { getAdminContactInquiries } from "@/lib/contact-inquiries";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { getAdminErrorLogs } from "@/lib/admin-error-logs";
import { getAdminUsers } from "@/lib/admin-users";

export type AdminCommandCenterSnapshot = {
  buildInfo: AppBuildInfo;
  users: AdminUserListResponse;
  dataQa: AdminDataQaSummaryResponse;
  errors: AdminErrorLogListResponse;
  inquiries: Awaited<ReturnType<typeof getAdminContactInquiries>>;
};

export async function getAdminCommandCenterSnapshot(): Promise<AdminCommandCenterSnapshot> {
  const [users, dataQa, errors, inquiries] = await Promise.all([
    getAdminUsers({ pageSize: 25 }),
    getAdminDataQaBankSummary(),
    getAdminErrorLogs({ pageSize: 50 }),
    getAdminContactInquiries({ pageSize: 20 }),
  ]);

  return {
    buildInfo: getAppBuildInfo(),
    users,
    dataQa,
    errors,
    inquiries,
  };
}
