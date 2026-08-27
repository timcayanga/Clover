import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { RouteSplash } from "@/components/route-splash";
import { TransactionTagsManager } from "@/components/transaction-tags-manager";
import { resolveTransactionOrganizationWorkspace } from "@/lib/transaction-organization-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Tags" };

async function TagsPageContent() {
  const workspace = await resolveTransactionOrganizationWorkspace();
  return (
    <CloverShell
      active="transactions"
      title="Manage Tags"
      subtitle={`Keep reusable labels tidy across transactions in ${workspace.name}.`}
      mobileBackHref="/transactions"
      actions={<Link className="button button-secondary button-small" href="/transactions/categories">Manage categories</Link>}
    >
      <section className="transactions-organization-page">
        <TransactionTagsManager workspaceId={workspace.id} />
      </section>
    </CloverShell>
  );
}

export default function TagsPage() {
  return <RouteSplash label="tags"><TagsPageContent /></RouteSplash>;
}
