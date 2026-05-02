import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign Up",
};

export default async function SignUpPage() {
  const session = await auth();

  if (session.userId) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page auth-page--signup">
      <PostHogEvent event="signup_started" onceKey={analyticsOnceKey("signup_started", "session")} />
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" />
    </main>
  );
}
