import { requireInternalAccess } from "@/lib/internal-access";
import { TeamStudio } from "@/components/team-studio";
import "./studio.css";
export const metadata = {
  title: "Team studio",
  robots: { index: false, follow: false },
};
export default async function TeamPage() {
  const access = await requireInternalAccess();
  return (
    <TeamStudio ownerId={access.userId} localPreview={access.localPreview} />
  );
}
