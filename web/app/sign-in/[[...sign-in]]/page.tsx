import { ClerkAuthScreen } from "@/components/clerk-auth-screen";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export default function SignInPage() {
  return (
    <main className="auth-page auth-page--signin">
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-in" />
    </main>
  );
}
