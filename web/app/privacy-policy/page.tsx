import type { Metadata } from "next";
import { PublicInfoShell } from "@/components/public-info-shell";
import { PrivacyPolicyDocument } from "@/components/legal-privacy-document";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "https://clover.ph/privacy-policy" },
  description:
    "Learn how Clover collects, uses, protects, and shares personal and financial information.",
};

export default function PrivacyPolicyPage() {
  return <PublicInfoShell active="privacy"><PrivacyPolicyDocument /></PublicInfoShell>;
}
