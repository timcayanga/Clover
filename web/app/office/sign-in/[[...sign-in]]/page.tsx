import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default async function OfficeSignIn({
  searchParams,
}: {
  searchParams: Promise<{ destination?: string }>;
}) {
  const destination =
    (await searchParams).destination === "admin" ? "/admin" : "/office";
  const configured = Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY,
  );
  return (
    <main id="main-content" className="studio office-login">
      <div>
        <span className="studio-eyebrow">CLOVER · PRIVATE WORKSPACE</span>
        <h1>Welcome back.</h1>
        <p>
          Sign in with your authorized Clover account to open Team and Admin.
        </p>
        {configured ? (
          <SignIn
            routing="path"
            path="/office/sign-in"
            forceRedirectUrl={destination}
            signUpUrl="/office/access-denied"
          />
        ) : (
          <p>Authentication is not configured for this deployment.</p>
        )}
        <Link href="https://clover.ph">Back to Clover ↗</Link>
      </div>
    </main>
  );
}
