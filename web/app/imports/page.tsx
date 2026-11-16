import { redirect } from "next/navigation";

export default async function ImportsPage({
  searchParams,
}: {
  searchParams?: Promise<{ workspaceId?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const workspaceId = Array.isArray(resolvedSearchParams?.workspaceId)
    ? resolvedSearchParams?.workspaceId[0]
    : resolvedSearchParams?.workspaceId;
  const workspaceQuery = workspaceId ? `&workspaceId=${encodeURIComponent(workspaceId)}` : "";
  redirect(`/transactions?import=1${workspaceQuery}`);
}
