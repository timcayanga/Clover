import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { PostHogAnalytics, PostHogClerkIdentity } from "@/components/posthog-analytics";
import { getAppBuildInfo } from "@/lib/build-info";

export const metadata: Metadata = {
  title: {
    default: "Clover",
    template: "Clover | %s",
  },
  description: "Clover helps you understand your money visually, review transactions faster, and get to action with less stress.",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  const buildInfo = getAppBuildInfo();
  const adminStylesheetVersion =
    buildInfo.environment === "development" ? `dev-${Date.now()}` : buildInfo.buildId;

  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href={`/admin.css?v=${adminStylesheetVersion}`} />
      </head>
      <body
        data-build-id={buildInfo.buildId}
        data-deployment-id={buildInfo.deploymentId ?? undefined}
        data-git-sha={buildInfo.gitSha ?? undefined}
        data-environment={buildInfo.environment}
      >
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey}>
            <PostHogAnalytics />
            <PostHogClerkIdentity />
            {children}
          </ClerkProvider>
        ) : (
          <>
            <PostHogAnalytics />
            {children}
          </>
        )}
      </body>
    </html>
  );
}
