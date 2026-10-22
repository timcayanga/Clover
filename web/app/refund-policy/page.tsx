import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";
import { PublicPolicyDocument } from "@/components/public-policy-document";

export const metadata: Metadata = {
  title: "Return and Refund Policy",
  description: "How to request help with Clover subscription payments, cancellation, returns and refunds.",
  alternates: { canonical: "https://clover.ph/refund-policy" },
};

export default function RefundPolicyPage() {
  return <PublicInfoShell active="refund"><PublicPolicyDocument
    title="Return and Refund Policy"
    intro="Clover provides a digital personal finance service. Here is how returns, subscription cancellation, and refund requests work."
    sections={[
      { id: "digital-service", title: "Digital service and returns", content: <>
        <p>Clover does not sell or ship physical goods. Physical returns, exchanges and return shipping do not apply. Paid plans provide digital access to the features and limits described at checkout.</p>
        <p>This policy applies to Clover subscriptions. It does not cover payments between people, bank transactions, or purchases shown in records you import into Clover.</p>
      </> },
      { id: "cancellation", title: "Cancellation is separate from a refund", content: <>
        <p>Monthly and annual subscriptions renew unless cancelled. Manage renewal in Clover’s Plan settings or with the provider that billed you. Check the cancellation confirmation and access end date. Cancelling future renewal does not itself request or guarantee a refund of an earlier payment.</p>
        <p>Uninstalling the app does not cancel a subscription. Before deleting your Clover account, complete the cancellation steps shown for your billing provider.</p>
      </> },
      { id: "eligibility", title: "When to request a refund", content: <>
        <p>Contact us promptly if you believe you were charged twice, charged without authorization, charged after a confirmed cancellation, or did not receive the paid access you purchased. We will investigate the payment and service issue.</p>
        <p>Refund eligibility, including any applicable withdrawal period or partial refund, follows the terms shown at purchase, the billing provider’s policy and applicable consumer law. A cancellation, downgrade or unused allowance alone does not guarantee a refund. Nothing in this policy limits a refund or other remedy you are entitled to under applicable law.</p>
      </> },
      { id: "request", title: "How to request help", content: <>
        <p>Email <a href="mailto:hello@clover.ph">hello@clover.ph</a> or use our <Link href="/contact-us">Contact page</Link>. Include your Clover account email, purchase date, amount and currency, billing provider, order or payment reference, and the reason for your request.</p>
        <p>Never send your password, one-time codes, complete card number, CVV, or bank credentials. Redact unrelated personal and financial information from any receipt you share.</p>
        <p>We aim to reply within 1 to 3 days. This is a support response target, not a guarantee of refund approval or bank processing time.</p>
      </> },
      { id: "provider", title: "Use the provider on your receipt", content: <ul>
        <li><strong>PayMongo:</strong> For a Clover payment processed through PayMongo, contact Clover using the details above. Clover reviews the request and, if approved, arranges the refund through the original payment provider.</li>
        <li><strong>Paddle:</strong> Use the support details on your receipt or <a href="https://www.paddle.com/legal/refund-policy">Paddle’s Refund Policy</a>. Paddle handles its purchases as the merchant of record.</li>
        <li><strong>Apple App Store:</strong> Follow <a href="https://support.apple.com/en-us/118223">Apple’s refund request instructions</a>. Apple reviews purchases billed by Apple.</li>
        <li><strong>Google Play:</strong> Follow <a href="https://support.google.com/googleplay/answer/2479637">Google Play’s refund policy and request process</a>. Clover can also help investigate your order.</li>
        <li><strong>Other providers:</strong> Contact Clover and use the provider identified on your receipt. Available payment methods vary by region and platform.</li>
      </ul> },
      { id: "processing", title: "Approved refunds and unresolved concerns", content: <>
        <p>Approved refunds are returned through the original payment method where supported. The provider and your bank or wallet determine when the funds appear. We will explain any further steps or restrictions that apply to your payment. Refunded purchases may result in a corresponding change to paid-plan access.</p>
        <p>If a concern remains unresolved, see our <Link href="/dispute-resolution">Dispute Resolution Policy</Link>. You retain your rights to contact your payment provider, bank, card issuer or a relevant consumer authority.</p>
      </> },
    ]}
  /></PublicInfoShell>;
}
