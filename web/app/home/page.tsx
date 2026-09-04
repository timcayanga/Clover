import { DashboardPageContent } from "@/components/dashboard-page-content";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Home",
};

export default async function HomePage() {
  return DashboardPageContent();
}
