import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { ReferralAccount } from "@/components/referral-account";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Refer & Earn | Clover",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { userId } = await auth();
  const { ref } = await searchParams;
  if (!userId) {
    const destination = `/referrals${ref ? `?ref=${encodeURIComponent(ref.slice(0, 64))}` : ""}`;
    return (
      <main style={{ maxWidth: 600, margin: "80px auto", padding: 24 }}>
        <h1>Refer &amp; Earn</h1>
        <p>
          Sign in to view your Clover referral rewards or use a referral code.
        </p>
        <Link href={`/sign-in?redirect_url=${encodeURIComponent(destination)}`}>
          Sign in to Clover
        </Link>
      </main>
    );
  }
  return (
    <main>
      <div style={{ maxWidth: 1200, margin: "24px auto", paddingInline: 24 }}>
        <Link href="/dashboard">← Clover</Link>
        <h1>Refer &amp; Earn</h1>
      </div>
      <ReferralAccount />
    </main>
  );
}
