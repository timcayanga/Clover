import { unstable_cache } from "next/cache";
import { getAdminDataEnvironment } from "@/lib/admin";
import { getAdminAnalyticsSnapshot, getAdminAuditLogs } from "@/lib/admin-analytics";
import { getAdminCommandCenterSnapshot } from "@/lib/admin-command-center";
import { getAdminDataQaBankSummary } from "@/lib/admin-data-qa-summary";
import { getAdminErrorLogs } from "@/lib/admin-error-logs";
import { getAdminOperationsSnapshot } from "@/lib/admin-operations";
import { getAdminUsers } from "@/lib/admin-users";
import { getAdminContactInquiries } from "@/lib/contact-inquiries";

// Admin reads are expensive aggregates, but they do not need millisecond-level
// freshness. Short TTLs keep navigation warm without caching any mutations.
const cachedCommandCenter = unstable_cache(
  async (_environment: string) => getAdminCommandCenterSnapshot(),
  ["admin-command-center-v3"],
  { revalidate: 30 },
);

const cachedAnalytics = unstable_cache(
  async (_environment: string) => getAdminAnalyticsSnapshot(),
  ["admin-analytics-v3"],
  { revalidate: 30 },
);

const cachedOperations = unstable_cache(
  async (_environment: string) => getAdminOperationsSnapshot(),
  ["admin-operations-v2"],
  { revalidate: 15 },
);

const cachedDataQaSummary = unstable_cache(
  async (_environment: string) => getAdminDataQaBankSummary(),
  ["admin-data-qa-summary-v2"],
  { revalidate: 30 },
);

const cachedInitialUsers = unstable_cache(
  async (_environment: string) => Promise.all([
    getAdminUsers({ page: 1, pageSize: 25 }),
    getAdminErrorLogs({ page: 1, pageSize: 25 }),
  ]),
  ["admin-initial-users-v2"],
  { revalidate: 5 },
);

const cachedAuditLogs = unstable_cache(
  async (_environment: string, query: string, page: number) => getAdminAuditLogs({ query, page }),
  ["admin-audit-logs-v2"],
  { revalidate: 5 },
);

const cachedErrorLogs = unstable_cache(
  async (_environment: string, query: string, page: number) => getAdminErrorLogs({ query, page }),
  ["admin-error-logs-v2"],
  { revalidate: 5 },
);

const cachedInquiries = unstable_cache(
  async (_environment: string) => getAdminContactInquiries({ pageSize: 200 }),
  ["admin-inquiries-v2"],
  { revalidate: 15 },
);

const environment = () => getAdminDataEnvironment();

export const getCachedAdminCommandCenterSnapshot = () => cachedCommandCenter(environment());
export const getCachedAdminAnalyticsSnapshot = () => cachedAnalytics(environment());
export const getCachedAdminOperationsSnapshot = () => cachedOperations(environment());
export const getCachedAdminDataQaBankSummary = () => cachedDataQaSummary(environment());
export const getCachedAdminInitialUsers = () => cachedInitialUsers(environment());
export const getCachedAdminAuditLogs = (query: string, page: number) => cachedAuditLogs(environment(), query, page);
export const getCachedAdminErrorLogs = (query: string, page: number) => cachedErrorLogs(environment(), query, page);
export const getCachedAdminInquiries = () => cachedInquiries(environment());
