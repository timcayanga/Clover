import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { PostHogAnalytics, PostHogClerkIdentity } from "@/components/posthog-analytics";

export const metadata: Metadata = {
  title: {
    default: "Clover",
    template: "Clover | %s",
  },
  description: "Clover helps you understand your money visually, review transactions faster, and get to action with less stress.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en">
      <body>
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
