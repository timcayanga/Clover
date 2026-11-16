import { ensureOnboardingAccess } from "@/lib/onboarding-access";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default async function AccountsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  await ensureOnboardingAccess();
  return children;
}
