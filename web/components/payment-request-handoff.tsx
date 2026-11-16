"use client";

import { useEffect, useState } from "react";
import { paymentAppLink, paymentOrigin } from "../../shared/payment-request-links";

export function PaymentRequestHandoff({ token }: { token: string }) {
  const [href, setHref] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    setAttempted(new URLSearchParams(window.location.search).has("browser"));
    setNotice("");
    const origin = paymentOrigin(window.location.origin);
    setHref(origin ? paymentAppLink(token, origin, /Android/i.test(navigator.userAgent)) : null);
  }, [token]);
  return (
    <div>
      {href ? <a className="button button-secondary" href={href} onClick={() => setAttempted(true)}>Open in Clover</a> : null}
      {attempted ? <p role="status">If Clover didn’t show this request, continue here. Your payment details are still available without signing in.</p> : null}
      <details>
        <summary>Opening from Messenger or another messaging app?</summary>
        <p>Use the browser menu to open this link in Safari or Chrome, then tap Open in Clover. Older Clover versions may not support payment links yet. You can always view the request and report payment on this page.</p>
        <button className="button button-secondary button-small" type="button" onClick={async () => {
          try { await navigator.clipboard.writeText(window.location.origin + window.location.pathname); setNotice("Link copied. Paste it into Safari or Chrome."); }
          catch { setNotice("Copy the link from your browser’s address bar."); }
        }}>Copy payment link</button>
      </details>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  );
}
