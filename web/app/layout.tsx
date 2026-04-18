import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { headers } from "next/headers";
import "./globals.css";
import { BlankPage } from "./blank/blank-page";

export const metadata: Metadata = {
  title: "Clover | Visual money clarity",
  description: "Clover helps you understand your money visually, review transactions faster, and get to action with less stress.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const stagingHosts = new Set(["staging.clover.ph"]);

const getHostname = async () => {
  const headerList = await headers();
  const rawHost = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  return rawHost.split(",")[0].split(":")[0].toLowerCase();
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const hostname = await getHostname();
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY;
  const isStagingHost = stagingHosts.has(hostname);
  const isProductionDeployment = process.env.NODE_ENV === "production";

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
