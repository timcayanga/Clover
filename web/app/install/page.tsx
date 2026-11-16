import type { Metadata } from "next";
import { InstallClover } from "@/components/install-clover";

export const metadata: Metadata = {
  title: "Install Clover",
  description: "Add Clover to your iPhone Home Screen for a faster, app-like experience.",
};

export default function InstallPage() {
  return <InstallClover />;
}
