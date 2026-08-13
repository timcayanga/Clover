import { prisma } from "@/lib/prisma";

export type OnboardingMissionId =
  | "add_data"
  | "check_data"
  | "review_transaction"
  | "confirm_recurring"
  | "open_insights";

export type OnboardingMission = {
  id: OnboardingMissionId;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  completed: boolean;
  optional?: boolean;
};

export type OnboardingMissionSnapshot = {
  dismissed: boolean;
  completedCount: number;
  totalCount: number;
  complete: boolean;
  missions: OnboardingMission[];
  nextMission: OnboardingMission | null;
};

const missionDefinitions: Array<Omit<OnboardingMission, "completed">> = [
  {
    id: "add_data",
    title: "Bring in your first data",
    description: "Upload a statement, screenshot, or receipt so Clover can build your financial picture.",
    href: "/accounts?import=1",
    actionLabel: "Upload a file",
  },
  {
    id: "check_data",
    title: "Check what Clover found",
    description: "Open your accounts and transactions to make sure the imported details look right.",
    href: "/accounts",
    actionLabel: "Check your data",
  },
  {
    id: "review_transaction",
    title: "Confirm or correct a transaction",
    description: "Review one transaction so Clover can learn how you want your money organized.",
    href: "/transactions?review=1",
    actionLabel: "Review a transaction",
  },
  {
    id: "confirm_recurring",
    title: "Keep a recurring payment",
    description: "Review a repeat payment and keep it if Clover identified it correctly.",
    href: "/recurring",
    actionLabel: "Review recurring",
  },
  {
    id: "open_insights",
    title: "See your first report",
    description: "See how your imported records turn into cash-flow summaries and useful guidance.",
    href: "/adviser",
    actionLabel: "Open Adviser",
  },
];

export const getOnboardingMissionSnapshot = async (
  actorUserIds: string[],
  workspaceId: string,
): Promise<OnboardingMissionSnapshot> => {
  const [importCount, manualAccountCount, manualTransactionCount, auditActions, recurringCount, recurringSuggestionCount] = await Promise.all([
    prisma.importFile.count({
      where: {
        workspaceId,
        OR: [{ confirmedAt: { not: null } }, { transactions: { some: { deletedAt: null } } }],
      },
    }),
    prisma.account.count({ where: { workspaceId, source: "manual" } }),
    prisma.transaction.count({ where: { workspaceId, importFileId: null, deletedAt: null } }),
    prisma.auditLog.findMany({
      where: {
        workspaceId,
        actorUserId: { in: actorUserIds },
        action: {
          in: [
            "onboarding_mission.check_data",
            "onboarding_mission.open_insights",
            "onboarding_mission.dismissed",
            "transaction_updated",
          ],
        },
      },
      select: { action: true },
      distinct: ["action"],
    }),
    prisma.financialCommitment.count({
      where: { workspaceId, source: "recurring_detection", status: "active" },
    }),
    prisma.recurringPattern.count({ where: { workspaceId } }),
  ]);

  const actions = new Set(auditActions.map((entry) => entry.action));
  const hasData = importCount > 0 || (manualAccountCount > 0 && manualTransactionCount > 0);
  const completion: Record<OnboardingMissionId, boolean> = {
    add_data: hasData,
    check_data: hasData && actions.has("onboarding_mission.check_data"),
    review_transaction: hasData && actions.has("transaction_updated"),
    confirm_recurring: hasData && recurringCount > 0,
    open_insights: hasData && actions.has("onboarding_mission.open_insights"),
  };
  const missions = missionDefinitions
    .filter((mission) => mission.id !== "confirm_recurring" || recurringSuggestionCount > 0 || recurringCount > 0)
    .map((mission) => ({ ...mission, completed: completion[mission.id] }));
  const completedCount = missions.filter((mission) => mission.completed).length;
  const complete = completedCount === missions.length;

  return {
    dismissed: actions.has("onboarding_mission.dismissed"),
    completedCount,
    totalCount: missions.length,
    complete,
    missions,
    nextMission: missions.find((mission) => !mission.completed) ?? null,
  };
};
