"use client";

import { useEffect, useState } from "react";

type PublicRequest = {
  recipientName: string;
  amount: string;
  currency: string;
  dueDate: string | null;
  status: string;
  note: string | null;
  bill: { title: string; billDate: string; currency: string };
  paymentProfile: {
    label: string;
    provider: string;
    currency: string;
    accountName: string | null;
    accountNumber: string | null;
    qrPayload: string | null;
    qrImageData: string | null;
  } | null;
};

export default function SplitBillPaymentRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const [request, setRequest] = useState<PublicRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState(false);

  useEffect(() => {
    void params.then(({ token }) => {
      fetch(`/api/split-bill-requests/${token}`)
        .then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error ?? "Payment request not found");
          setRequest(payload.request);
        })
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Payment request not found"));
    });
  }, [params]);

  const reportPayment = async () => {
    const { token } = await params;
    const response = await fetch(`/api/split-bill-requests/${token}`, { method: "POST" });
    if (response.ok) setReported(true);
  };

  if (error) return <main className="split-bill-public-request"><section className="panel glass"><h1>Payment request unavailable</h1><p>{error}</p></section></main>;
  if (!request) return <main className="split-bill-public-request"><section className="panel glass"><p>Loading payment request...</p></section></main>;

  return (
    <main className="split-bill-public-request">
      <section className="panel glass split-bill-public-request__card">
        <p className="eyebrow">Clover payment request</p>
        <h1>{request.bill.title}</h1>
        <p>{request.recipientName}, please send</p>
        <strong className="split-bill-public-request__amount">{request.currency} {Number(request.amount).toLocaleString()}</strong>
        {request.paymentProfile ? (
          <div className="split-bill-public-request__method">
            <strong>{request.paymentProfile.label}</strong>
            <span>{request.paymentProfile.provider}</span>
            {request.paymentProfile.accountName ? <span>{request.paymentProfile.accountName}</span> : null}
            {request.paymentProfile.accountNumber ? <span>{request.paymentProfile.accountNumber}</span> : null}
            {request.paymentProfile.qrImageData ? <img src={request.paymentProfile.qrImageData} alt="Payment QR code" /> : null}
            {request.paymentProfile.qrPayload ? <code>{request.paymentProfile.qrPayload}</code> : null}
          </div>
        ) : <p>Ask the bill owner for their preferred payment method.</p>}
        {request.note ? <p>{request.note}</p> : null}
        {request.status === "paid" ? <p className="split-bill-public-request__success">This payment has been confirmed.</p> : reported || request.status === "payment_reported" ? <p className="split-bill-public-request__success">Payment reported. The bill owner will confirm it.</p> : <button className="button button-primary" type="button" onClick={() => void reportPayment()}>I’ve paid</button>}
      </section>
    </main>
  );
}
