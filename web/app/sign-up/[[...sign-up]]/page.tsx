import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="page dashboard">
      <SignUp afterSignUpUrl="/onboarding" afterSignInUrl="/dashboard" />
    </main>
  );
}
