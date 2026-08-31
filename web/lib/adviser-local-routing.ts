import type { AdviserEverydayIntent } from "@/lib/adviser-everyday";
import type { AdviserToolName } from "@/lib/adviser-tool-routing";

export type AdviserAnswerRoute = {
  source: "local" | "backup";
  intent: string;
  confidence: number;
  reason: string;
};

type AdviserAnswerRoutingInput = {
  question: string;
  selectedTools: AdviserToolName[];
  everydayIntent?: AdviserEverydayIntent | null;
  asksForOverallMoneyOverview?: boolean;
  asksForSuggestedGoal?: boolean;
  asksAboutTransfers?: boolean;
};

const MODEL_REQUIRED_TOOLS = new Set<AdviserToolName>([
  "prepare_write_action",
  "check_affordability",
  "compare_safe_to_spend_scenarios",
  "get_adviser_scenario_history",
  "get_adviser_changes",
  "find_transactions",
  "open_report",
  "open_clover_area",
]);

const LOCAL_SUMMARY_TOOLS = new Set<AdviserToolName>([
  "get_account_summary",
  "get_goal_progress",
  "get_cashflow_outlook",
  "get_investment_summary",
]);

/** Select the cheapest answer path that remains fully grounded in Clover data. */
export const decideAdviserAnswerRoute = ({
  question,
  selectedTools,
  everydayIntent = null,
  asksForOverallMoneyOverview = false,
  asksForSuggestedGoal = false,
  asksAboutTransfers = false,
}: AdviserAnswerRoutingInput): AdviserAnswerRoute => {
  const normalized = question.trim().toLowerCase();
  if (!normalized) {
    return { source: "backup", intent: "empty_or_ambiguous", confidence: 0, reason: "empty_question" };
  }

  const modelRequiredTool = selectedTools.find((tool) => MODEL_REQUIRED_TOOLS.has(tool));
  if (modelRequiredTool && !(modelRequiredTool === "find_transactions" && asksAboutTransfers)) {
    return { source: "backup", intent: modelRequiredTool, confidence: 98, reason: "requires_model_arguments_or_reasoning" };
  }
  if (asksForSuggestedGoal) {
    return { source: "local", intent: "suggested_goal", confidence: 99, reason: "deterministic_goal_template" };
  }
  if (asksForOverallMoneyOverview) {
    return { source: "local", intent: "money_overview", confidence: 98, reason: "grounded_workspace_summary" };
  }
  if (asksAboutTransfers) {
    return { source: "local", intent: "transfer_review", confidence: 96, reason: "deterministic_transfer_lookup" };
  }
  if (everydayIntent) {
    return { source: "local", intent: everydayIntent, confidence: 95, reason: "recognized_financial_template" };
  }

  const localSummaryTool = selectedTools.length === 1 && LOCAL_SUMMARY_TOOLS.has(selectedTools[0])
    ? selectedTools[0]
    : null;
  if (localSummaryTool) {
    return { source: "local", intent: localSummaryTool, confidence: 94, reason: "grounded_summary_template" };
  }
  return { source: "backup", intent: "general_financial_reasoning", confidence: 85, reason: "no_high_confidence_local_template" };
};
