import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccountCardLuxuryGallery } from "@/components/account-card-luxury-gallery";

export const metadata: Metadata = {
  title: "Card Atelier - Clover Staging",
  description: "A staging-only review gallery for Clover account-card background concepts.",
};

export default function AccountCardGalleryPage() {
  if (process.env.VERCEL_ENV === "production") {
    notFound();
  }

  return <AccountCardLuxuryGallery />;
}
