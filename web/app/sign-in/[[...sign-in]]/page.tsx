import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="page dashboard">
      <SignIn afterSignInUrl="/dashboard" afterSignUpUrl="/onboarding" />
    </main>
  );
}
