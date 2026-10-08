import type { Metadata } from "next";
import { headers } from "next/headers";
import { Showcase } from "./showcase";

export const metadata: Metadata = {
  title: { absolute: "Clover · Your money, coming together" },
  description:
    "Months of finances. Organized in minutes. Explore a more connected picture of your money with Clover.",
  robots: { index: false, follow: false },
};

export default async function ShowcasePage() {
  const country = (await headers()).get("x-vercel-ip-country");
  return <Showcase initialMarket={country === "PH" ? "ph" : "global"} />;
}
