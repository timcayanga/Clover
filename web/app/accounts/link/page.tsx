"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { FinverseConnectButton } from "@/components/finverse-connect-button";

function LinkBankSetup() {
  const params = useSearchParams();
  const workspaceId = params?.get("finverseWorkspace");
  const connectionId = params?.get("finverseConnection");
  if (!workspaceId || !connectionId) {
    return <main className="finverse-setup"><h1>Link a bank</h1><Link href="/accounts">Back to Accounts</Link></main>;
  }
  return <main className="finverse-setup">
    <h1>Link a bank</h1>
    <FinverseConnectButton key={connectionId} workspaceId={workspaceId} setup />
  </main>;
}

export default function LinkBankPage() {
  return <Suspense fallback={<main className="finverse-setup" role="status">Opening bank setup…</main>}>
    <LinkBankSetup />
  </Suspense>;
}
