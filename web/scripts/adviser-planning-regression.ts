import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAdviserPlanningTurn } from "../lib/adviser-planning";

const workspaceId = "workspace-test";

const incompleteBudget = buildAdviserPlanningTurn({
  question: "Help me design a budget",
  surface: "budgeting",
  defaultCurrency: "PHP",
  workspaceId,
});
assert.equal(incompleteBudget?.draft.kind, "budget");
assert.equal(incompleteBudget?.draft.ready, false);
assert.deepEqual(incompleteBudget?.draft.missingFields, ["what the budget should cover", "a target amount"]);

const foodBudget = buildAdviserPlanningTurn({
  question: "Create a monthly food budget of PHP 8,000",
  surface: "budgeting",
  defaultCurrency: "USD",
  workspaceId,
});
assert.equal(foodBudget?.draft.title, "Food Budget");
assert.equal(foodBudget?.draft.payload.targetAmount, 8_000);
assert.equal(foodBudget?.draft.payload.currency, "PHP");
assert.equal(foodBudget?.draft.payload.cadence, "monthly");
assert.equal(foodBudget?.draft.action?.type, "create_budget");

const revisedBudget = buildAdviserPlanningTurn({
  question: "Make it 9,500 quarterly",
  surface: "budgeting",
  activeDraft: foodBudget?.draft,
  defaultCurrency: "PHP",
  workspaceId,
});
assert.equal(revisedBudget?.draft.id, foodBudget?.draft.id, "Conversational edits must update the same draft card.");
assert.equal(revisedBudget?.draft.title, "Food Budget");
assert.equal(revisedBudget?.draft.payload.targetAmount, 9_500);
assert.equal(revisedBudget?.draft.payload.cadence, "quarterly");

const goal = buildAdviserPlanningTurn({
  question: "Create an emergency fund goal of ₱120,000 yearly",
  surface: "goals",
  defaultCurrency: "USD",
  workspaceId,
});
assert.equal(goal?.draft.kind, "goal");
assert.equal(goal?.draft.payload.goal, "build_emergency_fund");
assert.equal(goal?.draft.payload.targetAmount, 120_000);
assert.equal((goal?.draft.payload.goalPlan as { cadence?: string }).cadence, "annual");
assert.equal(goal?.draft.action?.type, "set_goal");

assert.equal(buildAdviserPlanningTurn({
  question: "How are my current budgets doing?",
  surface: "budgeting",
  workspaceId,
}), null, "Budget status questions should stay in the existing Adviser analysis flow.");

const chat = readFileSync("components/adviser-chat.tsx", "utf8");
assert.match(chat, /activeDraft:\s*planningDraft/);
assert.match(chat, /adviser-planning-card/);
assert.match(chat, /planningDraft\.action/);
assert.match(readFileSync("components/contextual-ask-clover.tsx", "utf8"), /budgeting:[\s\S]*goals:/);
assert.match(readFileSync("app/api/adviser/actions/route.ts", "utf8"), /Choose a supported Clover goal/);
assert.match(readFileSync("app/api/adviser/chat/route.ts", "utf8"), /deterministic_planning_draft/);

console.log("Adviser planning regression passed: page context, draft cards, conversational edits, explicit confirmation, and safe goal/budget writes.");
