import { ClerkAuthScreen } from "@/components/clerk-auth-screen";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign Up",
};

export default function SignUpPage() {
  return (
    <main className="auth-page auth-page--signup">
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" />
    </main>
  );
}
