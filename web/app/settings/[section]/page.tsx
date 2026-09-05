import { notFound } from "next/navigation";
import SettingsPage from "../page";

const sections = new Set(["account", "profiles", "display", "data", "imports", "categories", "notifications", "security", "regional", "plan"]);

export default async function SettingsSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <SettingsPage searchParams={Promise.resolve({ section })} />;
}
