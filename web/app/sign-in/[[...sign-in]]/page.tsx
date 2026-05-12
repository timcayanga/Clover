import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { StagingRedirect } from "@/components/staging-redirect";
import { isStagingHost } from "@/lib/auth";
import { redirect } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign In",
};

export default async function SignInPage() {
  if (await isStagingHost()) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page auth-page--signin">
      <StagingRedirect />
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-in" />
    </main>
  );
}
