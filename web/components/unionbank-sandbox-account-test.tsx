"use client";

import { useState } from "react";
import type { SandboxAccountReport } from "@/lib/unionbank-sandbox-account";

export function UnionBankSandboxAccountTest({ available }: { available: boolean }) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<SandboxAccountReport | null>(null);
  const [error, setError] = useState("");
  async function run() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/bank-connections/unionbank/sandbox-account", {
        method: "POST", cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(40_000),
      });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "The test could not be completed."); return; }
      setReport(body.report);
    } catch {
      setError("The request timed out or the connection was interrupted. Click again to retrieve the same test result. It will not automatically create another account.");
    } finally { setRunning(false); }
  }
  return <section className="space-y-4 rounded-2xl border border-emerald-200 p-5" aria-label="Direct sandbox test">
    <h2 className="text-xl font-semibold">Create a dummy account and check its balance</h2>
    <p>This test uses your sandbox application subscription. It does not require the bank login page, and it does not import anything into Clover.</p>
    <button type="button" onClick={run} disabled={!available || running} className="rounded-xl bg-emerald-800 px-5 py-3 font-medium text-white disabled:opacity-40">
      {running ? "Testing — this can take up to 40 seconds…" : report ? "Retrieve test result" : "Create test account and check balance"}
    </button>
    <div aria-live="polite">
      {error && <p role="alert">{error}</p>}
      {report && <div className="space-y-3">
        <p><strong>Account creation: {report.creation}</strong></p>
        <p>{report.creationDetail}</p>
        {report.balance && <><p><strong>Balance: {report.balance.ok ? "Passed" : "Failed"}</strong></p><p>{report.balance.detail}</p>
          {report.balance.values?.map((row, index) => <p key={index}>{row.type}: {row.amount} {row.currency}</p>)}
        </>}
        <div className="ph-no-capture ph-mask space-y-2">
          <p>Save these dummy login details for the customer-login test later.</p>
          <label className="block">Dummy username<input className="block w-full rounded border p-2" value={report.username} readOnly autoComplete="off" /></label>
          <label className="block">Dummy password<input className="block w-full rounded border p-2" type="password" value={report.password} readOnly autoComplete="off" /></label>
          <button type="button" className="underline" onClick={() => navigator.clipboard.writeText(report.password).catch(() => setError("Could not copy. Select the dummy password field to copy it manually."))}>Copy dummy password</button>
          {report.accountNumber && <p>Dummy account number: {report.accountNumber}</p>}
        </div>
        <p>{report.creation === "failed" ? "This rejection is saved for one minute. After correcting the subscription or credentials, wait a minute before retrying." : "This result is saved securely for 24 hours. Repeated clicks retrieve the same result."}</p>
      </div>}
    </div>
    <p>Sandbox Account Information and customer transaction history still need a customer login token.</p>
  </section>;
}
