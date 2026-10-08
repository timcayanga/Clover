import Link from "next/link";
import { CloverMascot } from "@/components/clover-mascot";

export default function NotFound() {
  return <main className="error-screen">
    <section className="error-screen__card" aria-labelledby="not-found-title">
      <CloverMascot pose="notfound" size={240} />
      <div className="error-screen__copy">
        <p className="eyebrow">Page not found</p>
        <h1 id="not-found-title">Let’s get you back on track.</h1>
        <p>This page may have moved, or the link may be incomplete.</p>
        <div className="error-screen__actions"><Link className="button button-primary" href="/">Go to Clover</Link><Link className="button button-secondary" href="/help">Help Center</Link></div>
      </div>
    </section>
  </main>;
}
