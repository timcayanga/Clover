import { useEffect, useState } from "react";
import { Image, Linking } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { apiBase } from "../src/api-base";
import { Body, Card, Notice, Screen, money } from "../src/ui";
import { PlanAction, PlanHeader } from "../src/plan-ui";
import { PaymentOptionMark } from "../src/payment-option-mark";
type PublicRequest = {
  recipientName: string;
  amount: string;
  currency: string;
  status: string;
  note: string | null;
  bill: { title: string; billDate: string };
  items?: { description: string; amount: string }[];
  paymentProfile: {
    label: string;
    provider: string;
    accountName: string | null;
    accountNumber: string | null;
    qrImageData: string | null;
  } | null;
};
export default function PaymentRequest() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [request, setRequest] = useState<PublicRequest | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const valid =
    typeof token === "string" && /^[a-zA-Z0-9_-]{20,100}$/.test(token);
  useEffect(() => {
    if (!valid) {
      setError("This payment link is incomplete.");
      return;
    }
    let alive = true;
    const controller = new AbortController();
    fetch(`${apiBase()}/api/split-bill-requests/${token}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw Error(p.error ?? "Payment request unavailable.");
        if (alive) setRequest(p.request);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [token, valid]);
  const report = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${apiBase()}/api/split-bill-requests/${token}`, {
        method: "POST",
      });
      const p = await r.json();
      if (!r.ok) throw Error(p.error ?? "Could not report payment.");
      setRequest((q) =>
        q ? { ...q, status: p.status ?? "payment_reported" } : q,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen layout="dashboard">
      <PlanHeader title="Payment request" />
      <Body>No Clover account needed.</Body>
      {error ? <Notice>{error}</Notice> : null}
      {request ? (
        <Card>
          <Body muted={false}>{request.bill.title}</Body>
          <Body>
            Hi {request.recipientName}! Here’s your share whenever you’re ready.
          </Body>
          <Body muted={false}>{money(request.amount, request.currency)}</Body>
          <Body>{request.bill.billDate.slice(0, 10)}</Body>
          {request.items?.map((item, i) => (
            <Body key={i}>
              {item.description} · {money(item.amount, request.currency)} before
              splitting
            </Body>
          ))}
          {request.paymentProfile ? (
            <>
              <PaymentOptionMark
                provider={request.paymentProfile.provider}
              identity={request.paymentProfile}
                label={request.paymentProfile.label}
              />
              <Body>{request.paymentProfile.accountName}</Body>
              <Body>{request.paymentProfile.accountNumber}</Body>
              {request.paymentProfile.qrImageData ? (
                <Image
                  source={{ uri: request.paymentProfile.qrImageData }}
                  style={{
                    width: 200,
                    height: 200,
                    alignSelf: "center",
                    backgroundColor: "white",
                  }}
                  resizeMode="contain"
                  accessibilityLabel="Payment QR code"
                />
              ) : null}
            </>
          ) : null}
          {request.note ? <Body>{request.note}</Body> : null}
          {request.status === "requested" ? (
            <PlanAction
              title={busy ? "Reporting…" : "I’ve paid"}
              tone="primary"
              disabled={busy}
              onPress={() => void report()}
            />
          ) : (
            <Body>
              {request.status === "payment_reported"
                ? "Payment reported. The bill owner will confirm receipt."
                : request.status === "paid"
                  ? "Payment confirmed."
                  : "This request is no longer active."}
            </Body>
          )}
          <PlanAction
            title="View in browser"
            onPress={() =>
              void Linking.openURL(`${apiBase()}/split-bill/request/${token}`)
            }
          />
        </Card>
      ) : !error ? (
        <Body>Loading your payment details…</Body>
      ) : null}
    </Screen>
  );
}
