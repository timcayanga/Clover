import type { Metadata } from "next";
import { PublicInfoShell } from "@/components/public-info-shell";
import { TermsOfServiceDocument } from "@/components/legal-terms-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "https://clover.ph/terms-of-service" },
  description:
    "Read the terms that apply when you create an account or use Clover's personal finance tools.",
};

export default function TermsOfServicePage() {
  return <PublicInfoShell active="terms"><TermsOfServiceDocument /></PublicInfoShell>;
}
