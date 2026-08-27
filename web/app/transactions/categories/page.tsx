import Link from "next/link";
import { CloverShell } from "@/components/clover-shell";
import { SettingsCategoriesPanel } from "@/components/settings-categories-panel";
import { RouteSplash } from "@/components/route-splash";
import { resolveTransactionOrganizationWorkspace } from "@/lib/transaction-organization-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage Categories" };

async function CategoriesPageContent() {
  const workspace = await resolveTransactionOrganizationWorkspace();
  return (
    <CloverShell
      active="transactions"
      title="Manage Categories"
      subtitle={`Organize transactions in ${workspace.name}. Confirmed transactions will not be recategorized automatically.`}
      mobileBackHref="/transactions"
      actions={<Link className="button button-secondary button-small" href="/transactions/tags">Manage tags</Link>}
    >
      <section className="transactions-organization-page">
        <SettingsCategoriesPanel workspaceId={workspace.id} />
      </section>
    </CloverShell>
  );
}

export default function CategoriesPage() {
  return <RouteSplash label="categories"><CategoriesPageContent /></RouteSplash>;
}
