"use client";

import { useEffect, useState, useRef } from "react";
import { PaymentRequestHandoff } from "@/components/payment-request-handoff";

type PublicRequest = {
  recipientName: string;
  items?: { description: string; amount: string }[];
  amount: string;
  currency: string;
  dueDate: string | null;
  status: string;
  note: string | null;
  bill: { title: string; billDate: string; currency: string };
  paymentProfile: {
    label: string;
    provider: string;
    brandLogoUrl?: string | null;
    brandPalette?: { colors: string[]; foreground: string };
    currency: string;
    accountName: string | null;
    accountNumber: string | null;
    qrPayload: string | null;
    qrImageData: string | null;
  } | null;
};

export default function SplitBillPaymentRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const latest = useRef(params); latest.current = params;
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const [tokenValue, setTokenValue] = useState("");
  const [reporting, setReporting] = useState(false);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setRequest(null);
    setError(null);
    setReported(false);
    setReporting(false);
    setTokenValue("");
    void params.then(({ token }) => {
      if (!active) return;
      setTokenValue(token);
      fetch(`/api/split-bill-requests/${token}`, { signal: controller.signal })
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok)
            throw new Error(payload.error ?? "Payment request not found");
          if (active) setRequest(payload.request);
        })
        .catch((error) => {
          if (active)
            setError(
              error instanceof Error
                ? error.message
                : "Payment request not found",
            );
        });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [params]);

  const reportPayment = async () => {
    if (reporting) return;
    setReporting(true);
    setError(null);
    try {
      const { token } = await params;
      const response = await fetch(`/api/split-bill-requests/${token}`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error ?? "Could not report payment. Please try again.",
        );
      if (latest.current === params) setReported(true);
    } catch (e) {
      if (latest.current === params) setError(e instanceof Error ? e.message : "Could not report payment.");
    } finally {
      if (latest.current === params) setReporting(false);
    }
  };

  if (error && !request)
    return (
      <main className="split-bill-public-request">
        <section className="panel glass">
          <h1>Payment request unavailable</h1>
          <p>{error}</p>
        </section>
      </main>
    );
  if (!request)
    return (
      <main className="split-bill-public-request">
        <section className="panel glass">
          <p>Loading payment request...</p>
        </section>
      </main>
    );

  return (
    <main className="split-bill-public-request">
      <section className="panel glass split-bill-public-request__card">
        <p className="eyebrow">Clover payment request</p>
        {error ? <p role="alert">{error}</p> : null}
        <h1>{request.bill.title}</h1>
        <p>
          Hi {request.recipientName}! Here’s your share whenever you’re ready.
        </p>
        <small>
          No Clover account needed · {request.bill.billDate.slice(0, 10)}
        </small>
        {request.items?.length ? (
          <div>
            <strong>Your shared items</strong>
            {request.items.map((item, i) => (
              <p key={i}>
                {item.description} · {request.currency}{" "}
                {Number(item.amount).toFixed(2)}
              </p>
            ))}
            <small>
              Line-item amounts before splitting. Your requested share is below.
            </small>
          </div>
        ) : null}
        <strong className="split-bill-public-request__amount">
          {request.currency} {Number(request.amount).toLocaleString()}
        </strong>
        {request.paymentProfile ? (
          <div
            className="split-bill-public-request__method"
            style={{
              borderLeft: `4px solid ${request.paymentProfile.brandPalette?.colors[0] ?? "#03a8c0"}`,
            }}
          >
            <img
              src={
                request.paymentProfile.brandLogoUrl ||
                "/assets/account-types/bank.png"
              }
              alt={`${request.paymentProfile.provider} logo`}
              width={40}
              height={40}
              style={{
                width: 40,
                height: 40,
                objectFit: "contain",
                borderRadius: 8,
              }}
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/assets/account-types/bank.png";
              }}
            />
            <strong>{request.paymentProfile.label}</strong>
            <span>{request.paymentProfile.provider}</span>
            {request.paymentProfile.accountName ? (
              <span>{request.paymentProfile.accountName}</span>
            ) : null}
            {request.paymentProfile.accountNumber ? (
              <span>{request.paymentProfile.accountNumber}</span>
            ) : null}
            {request.paymentProfile.qrImageData ? (
              <img
                src={request.paymentProfile.qrImageData}
                alt="Payment QR code"
              />
            ) : null}
            {request.paymentProfile.qrPayload ? (
              <code>{request.paymentProfile.qrPayload}</code>
            ) : null}
          </div>
        ) : (
          <p>Ask the bill owner for their preferred payment method.</p>
        )}
        {request.note ? <p>{request.note}</p> : null}
        {request.status === "resolved" ? (
          <p>This bill has been resolved. No payment is requested.</p>
        ) : request.status === "paid" ? (
          <p className="split-bill-public-request__success">
            This payment has been confirmed.
          </p>
        ) : reported || request.status === "payment_reported" ? (
          <p className="split-bill-public-request__success">
            Payment reported. The bill owner will confirm it.
          </p>
        ) : request.status === "requested" ? (
          <button
            className="button button-primary"
            type="button"
            disabled={reporting}
            onClick={() => void reportPayment()}
          >
            {reporting ? "Reporting…" : "I’ve paid"}
          </button>
        ) : (
          <p>This request is no longer active.</p>
        )}
        <PaymentRequestHandoff token={tokenValue} />
      </section>
    </main>
  );
}
