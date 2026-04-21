import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { ClerkProvider } from "@clerk/nextjs";
import { PostHogEvent } from "@/components/posthog-analytics";
import { analyticsOnceKey } from "@/lib/analytics";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign Up",
};

export default function SignUpPage() {
  return (
    <main className="auth-page auth-page--signup">
      <ClerkProvider publishableKey={publishableKey ?? ""}>
        <PostHogEvent event="signup_started" onceKey={analyticsOnceKey("signup_started", "session")} />
        <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" />
      </ClerkProvider>
    </main>
  );
}
