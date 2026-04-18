import { SignUp } from "@clerk/nextjs";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export default function SignUpPage() {
  if (!publishableKey) {
    return (
      <main className="page dashboard">
        <section className="glass" style={{ maxWidth: 640, margin: "0 auto", padding: 24 }}>
          <p className="eyebrow">Authentication setup</p>
          <h1>Clerk is not configured for this environment yet.</h1>
          <p>
            Add <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code> to the staging
            environment, then redeploy to enable the sign-up form.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="page dashboard">
      <SignUp afterSignUpUrl="/onboarding" afterSignInUrl="/dashboard" />
    </main>
  );
}
