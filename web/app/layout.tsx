import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { BlankPage } from "./blank/blank-page";
import { StagingGate } from "./staging-gate";

export const metadata: Metadata = {
  title: "Clover",
  description: "Upload statements, understand cash flow, and act with clarity.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const stagingHosts = new Set(["staging.clover.ph"]);
const stagingCookieName = "clover_staging_access";

const getHostname = async () => {
  const headerList = await headers();
  const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  return rawHost.split(",")[0].split(":")[0].toLowerCase();
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hostname = await getHostname();
  const cookieStore = await cookies();
  const stagingCookie = cookieStore.get(stagingCookieName)?.value;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const isStagingHost = stagingHosts.has(hostname);
  const isProductionDeployment = process.env.NODE_ENV === "production";

  if (isStagingHost && stagingCookie !== "1") {
    return (
      <html lang="en">
        <body>
          <StagingGate />
        </body>
      </html>
    );
  }

  if (isProductionDeployment && !isStagingHost) {
    return (
      <html lang="en">
        <body>
          <BlankPage />
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        {publishableKey ? <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
