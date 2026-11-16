import GoalsPage from "../page";
export const dynamic = "force-dynamic";
export default function PrimaryGoalPage() {
  return <GoalsPage searchParams={Promise.resolve({ goal: "primary" })} />;
}
