import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";

export const metadata = { title: "Account deleted", robots: { index: false, follow: false } };

export default function AccountDeletedPage() {
  return <main className="auth-page">
    <section className="clover-auth-card" style={{ maxWidth: 440, margin: "auto", padding: 28, gap: 20, justifyItems: "center", textAlign: "center" }}>
      <CloverMascot pose="reassuring" size={160} />
      <h1>Your account is deleted</h1>
      <p>Thanks for spending time with Clover. You’re welcome back whenever you’re ready.</p>
      <Link className="button button-primary button-pill" href="/">Back to Clover</Link>
    </section>
  </main>;
}
