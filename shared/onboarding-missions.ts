export const missionDefinitions = [
  { id: "add_account", title: "Add your first account", href: "/accounts?add=1", actionLabel: "Add account" },
  { id: "add_transaction", title: "Add a transaction", href: "/transactions?manual=1", actionLabel: "Add transaction" },
  { id: "set_budget", title: "Set a budget", href: "/budgeting", actionLabel: "Add budget" },
  { id: "create_goal", title: "Create a savings goal", href: "/goals", actionLabel: "Add goal" },
  { id: "ask_clover", title: "Ask Clover a question", href: "/adviser", actionLabel: "Ask Clover" },
] as const;
export type OnboardingMissionId = typeof missionDefinitions[number]["id"];
export type OnboardingMission = typeof missionDefinitions[number] & { completed: boolean };
export type OnboardingMissionSnapshot = {
  dismissed: boolean; completedCount: number; totalCount: number; complete: boolean;
  missions: OnboardingMission[]; nextMission: OnboardingMission | null;
};
export function buildOnboardingMissions(completion: Record<OnboardingMissionId, boolean>, dismissed = false): OnboardingMissionSnapshot {
  const missions = missionDefinitions.map(mission => ({ ...mission, completed: completion[mission.id] }));
  const completedCount = missions.filter(mission => mission.completed).length;
  return { dismissed, missions, completedCount, totalCount: missions.length, complete: completedCount === missions.length, nextMission: missions.find(mission => !mission.completed) ?? null };
}

/** Choose artwork by the next unfinished mission, including out-of-order progress. */
export const missionMascotPoses = {
  add_account: "accounts", add_transaction: "receipt", set_budget: "budget",
  create_goal: "savings", ask_clover: "chat",
} as const satisfies Record<OnboardingMissionId, string>;
