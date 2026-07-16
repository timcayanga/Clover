import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign Up",
};

export default async function SignUpPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const intent = params.intent === "pro" ? "pro" : "free";
  const interval = params.interval === "monthly" ? "monthly" : "annual";
  const completeRedirectUrl = intent === "pro" ? `/onboarding?upgrade=pro&interval=${interval}` : "/onboarding";

  return (
    <main className="auth-page auth-page--signup">
      <PostHogEvent event="signup_started" onceKey={analyticsOnceKey("signup_started", "session")} />
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" completeRedirectUrl={completeRedirectUrl} />
    </main>
  );
}
