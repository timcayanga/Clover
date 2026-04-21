import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { ClerkProvider } from "@clerk/nextjs";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign In",
};

export default function SignInPage() {
  return (
    <main className="auth-page auth-page--signin">
      <ClerkProvider publishableKey={publishableKey ?? ""}>
        <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-in" />
      </ClerkProvider>
    </main>
  );
}
