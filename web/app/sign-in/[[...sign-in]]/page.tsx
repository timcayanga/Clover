import { ClerkAuthScreen } from "@/components/clerk-auth-screen";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getCircleInvitationPath,
  isCircleInvitationToken,
} from "@/lib/circle-invitations";

const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

export const metadata = {
  title: "Sign In",
};

export default async function SignInPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const circleInvite = Array.isArray(params.circleInvite)
    ? params.circleInvite[0]
    : params.circleInvite;
  const completeRedirectUrl = isCircleInvitationToken(circleInvite)
    ? getCircleInvitationPath(circleInvite, { accept: true })
    : "/continue";
  const session = await auth();
  if (session.userId) {
    redirect(completeRedirectUrl);
  }
  return (
    <main className="auth-page auth-page--signin">
      <ClerkAuthScreen enabled={Boolean(publishableKey)} mode="sign-in" completeRedirectUrl={completeRedirectUrl} />
    </main>
  );
}
