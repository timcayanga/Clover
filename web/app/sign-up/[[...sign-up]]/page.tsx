import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { PostHogEvent } from "@/components/posthog-analytics";
import { isStagingHost } from "@/lib/auth";
import { analyticsOnceKey } from "@/lib/analytics";
import { redirect } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign Up",
};

export default async function SignUpPage() {
  if (await isStagingHost()) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page auth-page--signup">
      <PostHogEvent event="signup_started" onceKey={analyticsOnceKey("signup_started", "session")} />
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" />
    </main>
  );
}
