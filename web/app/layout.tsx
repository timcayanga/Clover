import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import Script from "next/script";
import "./globals.css";
import { GlobalImportActivity } from "@/components/global-import-activity";
import { PostHogAnalytics, PostHogClerkIdentity } from "@/components/posthog-analytics";
import { getAppBuildInfo } from "@/lib/build-info";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_STORAGE_KEY } from "@/lib/theme-preference";

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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href={`/admin.css?v=${adminStylesheetVersion}`} />
        <Script id="clover-theme-bootstrap" strategy="beforeInteractive">
          {`
            (() => {
              try {
                const key = ${JSON.stringify(THEME_STORAGE_KEY)};
                const saved = window.localStorage.getItem(key);
                const mode = saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
                const resolved =
                  mode === "system"
                    ? window.matchMedia("(prefers-color-scheme: dark)").matches
                      ? "dark"
                      : "light"
                    : mode;
                document.documentElement.dataset.theme = resolved;
                document.documentElement.style.colorScheme = resolved;
              } catch (error) {}
            })();
          `}
        </Script>
      </head>
      <body
        data-build-id={buildInfo.buildId}
        data-deployment-id={buildInfo.deploymentId ?? undefined}
        data-git-sha={buildInfo.gitSha ?? undefined}
        data-environment={buildInfo.environment}
      >
        {publishableKey ? (
          <ClerkProvider publishableKey={publishableKey} signInUrl="/sign-in" signUpUrl="/sign-up">
            <PostHogAnalytics />
            <PostHogClerkIdentity />
            <GlobalImportActivity />
            <ThemeSync />
            {children}
          </ClerkProvider>
        ) : (
          <>
            <PostHogAnalytics />
            <GlobalImportActivity />
            <ThemeSync />
            {children}
          </>
        )}
      </body>
    </html>
  );
}
