import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign In",
};

export default async function SignInPage() {
  const session = await auth();

  if (session.userId) {
    redirect("/dashboard");
  }

  return (
    <main className="auth-page auth-page--signin">
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-in" />
    </main>
  );
}
