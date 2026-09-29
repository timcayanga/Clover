import Link from "next/link";
import { cookies, headers } from "next/headers";
import { CloverShell } from "@/components/clover-shell";
import { UnionBankSandboxAccountTest } from "@/components/unionbank-sandbox-account-test";
import { sandboxConfig, type ProbeReport } from "@/lib/unionbank-sandbox";
import { reportCookie, reportKey, sandboxActor, sandboxStore } from "@/lib/unionbank-sandbox-session";

export const dynamic = "force-dynamic";
// Native form POSTs send Origin: null under no-referrer. Keep same-origin
// submissions identifiable; the OAuth redirects still use no-referrer.
export const metadata = { title: "UnionBank sandbox test", robots: { index: false, follow: false }, referrer: "same-origin" as const };
export default async function UnionBankSandboxPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  let available = false;
  let report: ProbeReport | null = null;
  let notice = "Sign in to Clover with a customer account to run this test.";
  try {
    const actor = await sandboxActor();
    notice = "The sandbox test requires the staging domain, UnionBank credentials, and Redis configuration.";
    sandboxConfig();
    if ((await headers()).get("host") === "staging.clover.ph") {
      const store = sandboxStore();
      await store.ping();
      available = true;
      const id = (await cookies()).get(reportCookie)?.value;
      if (id && /^[\w-]{43}$/.test(id)) {
        const raw = await store.get(reportKey(id));
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.actor === actor) report = saved.report;
      }
    }
  } catch { /* Display a safe setup message; never render backend errors. */ }
  const failed = (await searchParams).result === "failed";
  return <CloverShell active="settings" title="UnionBank sandbox" mobileBackHref="/settings">
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/settings" className="underline">Back to settings</Link>
      <h1 className="text-2xl font-semibold">Test UnionBank access</h1>
      <p>Use a UnionBank sandbox test account. This checks login and read access; it does not create a lasting bank connection or import transactions.</p>
      {!available && <p role="status">{notice}</p>}
      <UnionBankSandboxAccountTest available={available} />
      <h2 className="text-xl font-semibold">Test customer login</h2>
      <p>This separate test opens UnionBank’s login page. If that page is unavailable, use the direct sandbox test above.</p>
      {failed && <p role="alert">The login was canceled, expired, or could not be verified. Sign in to Clover and start a new test.</p>}
      <form action="/api/bank-connections/unionbank/start" method="post">
        <button disabled={!available} className="rounded-xl bg-emerald-800 px-5 py-3 font-medium text-white disabled:opacity-40">Start sandbox test</button>
      </form>
      {report && <section className="space-y-3" aria-label="Test results">
        <h2 className="text-xl font-semibold">Latest test</h2>
        <p>{report.checkedAt}</p>
        <ul className="space-y-3">{report.checks.map(check => <li key={check.name}>
          <strong>{check.name}: {check.ok ? "Passed" : "Failed"}</strong><p>{check.detail}</p>
        </li>)}</ul>
        <p>Results expire after ten minutes. Passing these checks does not establish production access, full history coverage, or automatic synchronization.</p>
      </section>}
    </div>
  </CloverShell>;
}
