import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideAdviserAnswerRoute } from "@/lib/adviser-local-routing";

const localCases = [
  decideAdviserAnswerRoute({ question: "Give me my overall money picture", selectedTools: ["get_account_summary"], asksForOverallMoneyOverview: true }),
  decideAdviserAnswerRoute({ question: "Which transactions were transfers?", selectedTools: ["find_transactions"], asksAboutTransfers: true }),
  decideAdviserAnswerRoute({ question: "How can I save more?", selectedTools: ["build_saving_plan"], everydayIntent: "saving" }),
  decideAdviserAnswerRoute({ question: "What is my portfolio balance?", selectedTools: ["get_investment_summary"] }),
  decideAdviserAnswerRoute({ question: "Will I have enough for upcoming bills?", selectedTools: ["get_cashflow_outlook"] }),
];
for (const result of localCases) {
  assert.equal(result.source, "local");
  assert.ok(result.confidence >= 90);
}

const backupCases = [
  decideAdviserAnswerRoute({ question: "Create a PHP 8,000 food budget", selectedTools: ["prepare_write_action"], everydayIntent: "food_choice" }),
  decideAdviserAnswerRoute({ question: "Can I afford this PHP 50,000 phone?", selectedTools: ["check_affordability"] }),
  decideAdviserAnswerRoute({ question: "Find my last three payments to Acme", selectedTools: ["find_transactions"] }),
  decideAdviserAnswerRoute({ question: "What changed since last month?", selectedTools: ["get_adviser_changes"] }),
  decideAdviserAnswerRoute({ question: "What should I focus on?", selectedTools: [] }),
];
for (const result of backupCases) assert.equal(result.source, "backup");

const routeSource = readFileSync(new URL("../app/api/adviser/chat/route.ts", import.meta.url), "utf8");
const routingIndex = routeSource.indexOf("const answerRoute = decideAdviserAnswerRoute");
const providerIndex = routeSource.indexOf('fetch("https://api.openai.com/v1/responses"');
assert.ok(routingIndex > 0);
assert.ok(providerIndex > routingIndex, "Local routing must happen before any paid provider request");
assert.match(routeSource, /answerRoute\.source === "local"/);
assert.match(routeSource, /answerSource: "local"/);
assert.match(routeSource, /routingVersion: routing \? "tiered-v1"/);

console.log("Adviser local routing regression passed.");
