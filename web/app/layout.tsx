import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import "./globals.css";
import { GlobalImportActivity } from "@/components/global-import-activity";
import { ClerkAppProvider } from "@/components/clerk-app-provider";
import { PostHogAnalytics, PostHogClerkIdentity } from "@/components/posthog-analytics";
import { getAppBuildInfo } from "@/lib/build-info";
import { ThemeSync } from "@/components/theme-sync";
import { THEME_RESOLVED_COOKIE_KEY, THEME_STORAGE_KEY } from "@/lib/theme-preference";
import { HelperTextSync } from "@/components/helper-text-sync";
import { StagingBrowserStateReset } from "@/components/staging-browser-state-reset";
import { AdminOnlyRedirect } from "@/components/admin-only-redirect";
import { ModalKeyboardController } from "@/components/modal-keyboard-controller";
import { CRITICAL_NAVIGATION_ICON_NAMES, getNavigationIconSrc } from "@/lib/navigation-icons";
import { PwaServiceWorker } from "@/components/pwa-service-worker";

const clerkLocalization = {
  userProfile: {
    navbar: {
      title: "Account",
      description: "Manage your account details.",
      account: "Account",
      security: "Security",
      billing: "Billing",
      apiKeys: "API Keys",
    },
    start: {
      headerTitle__account: "Account details",
      headerTitle__security: "Security",
      profileSection: {
        title: "Account details",
        primaryButton: "Update Account",
      },
      passwordSection: {
        title: "Password",
        primaryButton__updatePassword: "Update Account",
        primaryButton__setPassword: "Set Password",
      },
    },
    profilePage: {
      title: "Update Account",
      imageFormTitle: "Account photo",
      imageFormSubtitle: "Upload a new account photo.",
      imageFormDestructiveActionSubtitle: "Remove your account photo.",
      fileDropAreaHint: "Drop an image here or click to browse.",
      readonly: "Read only",
      successMessage: "Account updated.",
    },
    passwordPage: {
      title__set: "Set Password",
      title__update: "Update Account",
      successMessage__set: "Password set.",
      successMessage__update: "Password updated.",
      successMessage__signOutOfOtherSessions: "Signed out of other sessions.",
    },
  },
};

export const metadata: Metadata = {
  title: {
    default: "Clover",
    template: "Clover | %s",
  },
  description: "Clover helps you understand your money visually, review transactions faster, and get to action with less stress.",
  applicationName: "Clover",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Clover",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon.svg",
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  const buildInfo = getAppBuildInfo();
  const themeCookie = (await cookies()).get(THEME_RESOLVED_COOKIE_KEY)?.value;
  const serverTheme = themeCookie === "light" || themeCookie === "dark" ? themeCookie : null;

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-theme={serverTheme ?? undefined}
      style={serverTheme ? { colorScheme: serverTheme } : undefined}
    >
      <head>
        {CRITICAL_NAVIGATION_ICON_NAMES.map((icon) => (
          <link
            key={icon}
            rel="preload"
            href={getNavigationIconSrc(icon)}
            as="image"
            type="image/webp"
          />
        ))}
      </head>
      <body
        data-build-id={buildInfo.buildId}
        data-deployment-id={buildInfo.deploymentId ?? undefined}
        data-git-sha={buildInfo.gitSha ?? undefined}
        data-environment={buildInfo.environment}
      >
        <PwaServiceWorker />
        <ThemeSync />
        <HelperTextSync />
        <ModalKeyboardController />
        <StagingBrowserStateReset
          buildId={buildInfo.buildId}
          deploymentId={buildInfo.deploymentId ?? null}
          gitSha={buildInfo.gitSha ?? null}
        />
        <GlobalImportActivity />
        {publishableKey ? (
          <ClerkAppProvider publishableKey={publishableKey} localization={clerkLocalization}>
            <PostHogAnalytics />
            <PostHogClerkIdentity />
            <AdminOnlyRedirect />
            {children}
          </ClerkAppProvider>
        ) : (
          <>
            <PostHogAnalytics />
            {children}
          </>
        )}
      </body>
      <Script id="clover-theme-bootstrap" strategy="beforeInteractive">
        {`
          (() => {
            try {
              const key = ${JSON.stringify(THEME_STORAGE_KEY)};
              const saved = window.localStorage.getItem(key);
              const pathname = window.location.pathname;
              const isLightOnlyRoute =
                pathname === "/" ||
                pathname === "/install" ||
                pathname.startsWith("/sign-in") ||
                pathname.startsWith("/sign-up") ||
                pathname === "/onboarding";
              const mode = isLightOnlyRoute
                ? "light"
                : saved === "light" || saved === "dark"
                  ? saved
                  : "light";
              const resolved = mode;
              document.documentElement.dataset.theme = resolved;
              document.documentElement.style.colorScheme = resolved;
            } catch (error) {}
          })();
        `}
      </Script>
    </html>
  );
}
