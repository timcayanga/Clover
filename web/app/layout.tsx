import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Poppins, Raleway } from "next/font/google";
import "./globals.css";
import "./collection-layouts.css";
import { GlobalImportActivity } from "@/components/global-import-activity";
import { ClerkAppProvider } from "@/components/clerk-app-provider";
import { PostHogAnalytics, PostHogClerkIdentity } from "@/components/posthog-analytics";
import { getAppBuildInfo } from "@/lib/build-info";
import { ThemeSync } from "@/components/theme-sync";
import {
  LIGHT_ONLY_THEME_PREFIXES,
  LIGHT_ONLY_THEME_ROUTES,
  THEME_COLORS,
  THEME_RESOLVED_COOKIE_KEY,
  THEME_STORAGE_KEY,
} from "@/lib/theme-preference";
import { HelperTextSync } from "@/components/helper-text-sync";
import { StagingBrowserStateReset } from "@/components/staging-browser-state-reset";
import { AdminOnlyRedirect } from "@/components/admin-only-redirect";
import { ModalKeyboardController } from "@/components/modal-keyboard-controller";
import { CRITICAL_NAVIGATION_ICON_NAMES, getNavigationIconSrc } from "@/lib/navigation-icons";
import { PwaServiceWorker } from "@/components/pwa-service-worker";
import { getChunkRecoveryBootstrapScript } from "@/lib/chunk-error-bootstrap";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

const raleway = Raleway({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-raleway",
  display: "swap",
});

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
      { url: "/pwa/icon-192-gradient.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512-gradient.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon.svg",
    apple: [{ url: "/pwa/apple-touch-icon-gradient.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
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
      className={`${poppins.variable} ${raleway.variable}`}
      suppressHydrationWarning
      data-theme={serverTheme ?? undefined}
      style={serverTheme ? { colorScheme: serverTheme } : undefined}
    >
      <head>
        <script
          id="clover-theme-bootstrap"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              (() => {
                try {
                  const key = ${JSON.stringify(THEME_STORAGE_KEY)};
                  const saved = window.localStorage.getItem(key);
                  const pathname = window.location.pathname;
                  const lightOnlyRoutes = ${JSON.stringify(LIGHT_ONLY_THEME_ROUTES)};
                  const lightOnlyPrefixes = ${JSON.stringify(LIGHT_ONLY_THEME_PREFIXES)};
                  const isLightOnlyRoute =
                    lightOnlyRoutes.includes(pathname) ||
                    lightOnlyPrefixes.some((prefix) => pathname.startsWith(prefix));
                  const resolved = isLightOnlyRoute ? "light" : saved === "light" || saved === "dark" ? saved : "light";
                  document.documentElement.dataset.theme = resolved;
                  document.documentElement.style.colorScheme = resolved;
                } catch (error) {}
              })();
            `,
          }}
        />
        <script
          id="clover-chunk-recovery"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getChunkRecoveryBootstrapScript(buildInfo.buildId) }}
        />
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
    </html>
  );
}
