import { ClerkAuthScreen } from "@/components/clerk-auth-screen";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
  return (
    <main className="page dashboard">
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-up" />
    </main>
  );
}
