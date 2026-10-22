import type { Metadata } from "next";
import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";
import { PublicPolicyDocument } from "@/components/public-policy-document";

export const metadata: Metadata = {
  title: "Dispute Resolution Policy",
  description: "How Clover handles billing complaints, service concerns and unresolved disputes.",
  alternates: { canonical: "https://clover.ph/dispute-resolution" },
};

export default function DisputeResolutionPage() {
  return <PublicInfoShell active="disputes"><PublicPolicyDocument
    title="Dispute Resolution Policy"
    intro="If something is wrong with a Clover payment or service, we want to help you resolve it clearly and fairly."
    sections={[
      { id: "contact", title: "Tell us what happened", content: <>
        <p>Email <a href="mailto:hello@clover.ph">hello@clover.ph</a> or use our <Link href="/contact-us">Contact page</Link>. Include your account email, a description of the issue, the outcome you are requesting, and any relevant order or payment reference. For billing issues, include the purchase date, amount, currency and provider shown on your receipt.</p>
        <p>Never send passwords, one-time codes, full card details, CVVs, or bank credentials. Redact unrelated information from supporting documents.</p>
      </> },
      { id: "review", title: "Our review and response", content: <>
        <p>We aim to reply within 1 to 3 days. We may ask for information needed to verify account ownership or investigate the issue. We review relevant service and payment records and explain the outcome or the next steps. If an investigation needs more time or action by a provider, we will explain this in our response.</p>
        <p>If you disagree with the response, reply in the same support conversation and ask for a further review, explaining what remains unresolved.</p>
      </> },
      { id: "billing", title: "Payment disputes and refunds", content: <>
        <p>See our <Link href="/refund-policy">Return and Refund Policy</Link> for refund requests. Purchases billed by Apple, Google Play, Paddle or another provider may also require that provider’s process. For PayMongo-processed Clover payments, contact Clover so we can review and coordinate with the payment provider.</p>
        <p>You may contact your bank, card issuer, wallet or payment provider directly, including to report an unauthorized charge. Contacting Clover first is a support option, not a condition that limits your dispute rights or extends a provider’s reporting deadlines.</p>
      </> },
      { id: "scope", title: "Concerns about imported financial records", content: <>
        <p>Clover organizes financial information; it does not hold or transfer your money. We can help with Clover imports, categorization, reports and service issues. For an underlying bank transaction, merchant purchase, transfer or investment dispute, contact the institution or merchant responsible.</p>
      </> },
      { id: "rights", title: "Applicable law and further remedies", content: <>
        <p>As set out in our <Link href="/terms-of-service#law">Terms of Service</Link>, Philippine law governs these terms, subject to rights that cannot be excluded under applicable law. Where permitted by law, disputes may be submitted to the appropriate courts in the Philippines.</p>
        <p>Nothing in this policy prevents you from using a regulator, consumer protection process, payment-provider process or court available to you under applicable law.</p>
      </> },
    ]}
  /></PublicInfoShell>;
}
