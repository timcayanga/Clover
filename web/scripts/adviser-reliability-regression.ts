import { adviserFactIntent, adviserRequestedCurrency, resolveAdviserFactQuestion } from "../lib/adviser-facts";
import { adviserCountryCurrencyAnswer, resolveAdviserCountryCurrency, adviserBudgetDestination, adviserCurrencyExplanation, adviserRegionalBudgetReply, adviserRegionalContext, resolveAdviserLocalCurrency, resolveAdviserRegionalBudget } from "../lib/adviser-regional";
import { selectExistingClerkSession } from "../lib/clerk-initial-session";
import assert from "node:assert/strict";
import { adviserCurrency, adviserMonthRange, isSpendingSummaryQuestion, commitmentInstallment, upcomingBillsReply } from "../lib/adviser-analysis";
import { classifyAdviserScope } from "../lib/adviser-scope";
import { classifyEverydayQuestion, isEverydayFollowUp } from "../lib/adviser-everyday";
import { selectAdviserToolNames } from "../lib/adviser-tool-routing";
import { readAiConsent } from "../lib/ai-consent-request";
import { resolveCircleMemberPhoto } from "../lib/circle-member-photo-match";
import { buildBudgetOverview } from "../lib/budgeting";
async function main() {
  for(const q of ["What is an emergency fund?","Check upcoming bills","Explain compound interest","List overdue payments"]) assert(classifyAdviserScope(q).allowed,q);
  assert.equal(classifyEverydayQuestion("What is an emergency fund?"), null);
  assert.deepEqual(selectAdviserToolNames({question:"What is an emergency fund?"}), []);
  assert.equal(isEverydayFollowUp("What is an emergency fund?"), false);
  assert.equal(isEverydayFollowUp("Check upcoming bills"), false);
  assert.equal(isEverydayFollowUp("PHP 25,000"), true);
  assert.equal(isEverydayFollowUp("Yes"), true);
  const routine = "What is a simple weekly routine for keeping track of several bank accounts, a credit card, and e-wallets?";
  assert.equal(classifyAdviserScope(routine).allowed,true);
  assert.equal(classifyAdviserScope("What is a simple workout routine?").allowed,false);
  assert.equal(classifyEverydayQuestion(routine),null);
  assert.deepEqual(selectAdviserToolNames({question:routine}),[]);
  assert.equal(classifyEverydayQuestion("What credit card can I get?"),"credit_card");
  assert.deepEqual(selectAdviserToolNames({question:"How are my budgets doing?"}),["get_budget_status"]);
  assert(isSpendingSummaryQuestion("Show my PHP spending by category for September 2026. Focus only on expenses, excluding transfers."));
  assert.equal(isSpendingSummaryQuestion("How much did I spend at Starbucks in September?"),false);
  assert.equal(isSpendingSummaryQuestion("Compare food spending this month"),false);
  assert.equal(adviserCurrency("My USD spending",["PHP","USD"]),"USD");
  assert.equal(adviserCurrency("My spending",["USD","PHP"]),"PHP");
  const now = new Date("2026-09-29T04:00:00Z");
  const range=adviserMonthRange("September 2026",now)!;
  assert.equal(range.start.toISOString(),"2026-09-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(),"2026-10-01T00:00:00.000Z");
  assert.equal(adviserMonthRange("last month",new Date("2026-01-15"))!.label,"December 2025");
  assert.equal(commitmentInstallment({kind:"debt",amount:1749000,tracking:{paymentAmount:15000}}),15000);
  assert.equal(commitmentInstallment({kind:"debt",amount:1749000}),0);
  const transactions=[{currency:"PHP",amount:100,date:new Date("2026-09-01")},{currency:"USD",amount:500,date:now},{currency:"PHP",amount:700,date:new Date("2026-08-31")}].map(t=>({...t,accountId:"a",categoryId:"food",type:"expense" as const,isExcluded:false}));
  const budgets=buildBudgetOverview({now,budgets:[{id:"b",name:"Food",kind:"spend_limit",scope:"category",cadence:"monthly",targetAmount:200,currency:"PHP",isActive:true,accountId:null,categoryId:"food"}],transactions}).budgets;
  assert.equal(budgets[0].actualAmount,100);assert.equal(budgets[0].remainingAmount,100);
  const billsReply = upcomingBillsReply({currency:"PHP",horizonDays:14,availableCash:100000,details:{recurring:[],commitments:[{label:"Mortgage installment",amount:15000,due:"2026-10-01"},{label:"Unknown loan",amount:0,due:"2026-10-02"}],plannedPayments:[]}});
  assert.match(billsReply,/Mortgage installment: ₱15,000.00/);
  assert.match(billsReply,/Oct 1/);
  assert.match(billsReply,/Unknown loan: installment amount not recorded/);
  const member={userId:"u",displayName:"Alex Reyes"};
  assert.equal(resolveCircleMemberPhoto(member,[{name:"Alex Reyes",avatarUrl:"shared.jpg"}],new Map([["u","profile.jpg"]])),"profile.jpg");
  assert.equal(resolveCircleMemberPhoto({...member,userId:null},[{name:" Alex Reyes ",avatarUrl:"shared.jpg"}],new Map()),"shared.jpg");
  assert.equal(resolveCircleMemberPhoto(member,[],new Map()),null);
  assert.equal(resolveCircleMemberPhoto(member,[{name:"Alex Reyes",avatarUrl:"a"},{name:"Alex Reyes",avatarUrl:"b"}],new Map()),null);
  const client = {sessions:[{id:"older"},{id:"active"}],lastActiveSessionId:"active"};
  assert.equal(selectExistingClerkSession(client,"")?.id,"active");
  assert.equal(selectExistingClerkSession(client,"older")?.id,"older");
  assert.equal(selectExistingClerkSession(client,"expired")?.id,"active");
  assert.equal(selectExistingClerkSession({sessions:[],lastActiveSessionId:null}),null);
  let calls=0;
  assert.deepEqual(await readAiConsent(async()=>{calls++;return calls===1?new Response(null,{status:503}):Response.json({allowed:true});}),{allowed:true});assert.equal(calls,2);
  calls=0;await assert.rejects(readAiConsent(async()=>{calls++;return new Response(null,{status:401});}),/session/);assert.equal(calls,1);
  await assert.rejects(readAiConsent(async()=>new Response(null,{status:503})),/Unable/);
  assert.deepEqual(await readAiConsent(async()=>Response.json({allowed:false})),{allowed:false});
  await assert.rejects(readAiConsent(async()=>Response.json({allowed:"true"})),/Invalid/);
  console.log("Adviser reliability and Circle photos passed: scope, intent, month/currency boundaries, installments, budget arithmetic, identity matching and fail-closed consent retries.");
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
import { spendingRoomOptions, spendingRoomReply } from "../lib/adviser-spending-room";

assert.deepEqual(spendingRoomOptions("How much can I spend on a trip over the next 30 days in PHP, after bills, everyday spending and savings? Keep an extra PHP 5,000 buffer."), {horizonDays:30, additionalBuffer:5000});
assert.deepEqual(spendingRoomOptions("How much can we spend over 2 weeks? Keep an additional ₱5k reserve."), {horizonDays:14, additionalBuffer:5000});
for (const question of [
  "How much can I spend for 100 days?",
  "How much can I spend until October 26?",
  "How much can I spend? I have PHP 50,000 available.",
  "How much can I spend? Include expected income of PHP 40,000.",
  "How much can I spend? Keep an extra USD 5,000 buffer.",
  "How much can I spend? Don't keep an extra PHP 5,000 buffer.",
]) assert.equal(spendingRoomOptions(question), null, question);
const room = {currency:"PHP",horizonDays:30,availableCash:50000,expectedIncome:0,knownObligations:10000,everydaySpendingBuffer:5000,goalContribution:5000,additionalBuffer:5000,safeToSpend:25000,roomAfterProtection:25000,confidence:{label:"medium",score:65},caveats:["Some debt installments are missing."]};
assert.match(spendingRoomReply(room), /Estimated spending room: ₱25,000.00/);
assert.match(spendingRoomReply(room), /Some debt installments are missing/);
assert.match(spendingRoomReply({...room,safeToSpend:0,roomAfterProtection:-1000}), /No spending room.*exceed available cash by ₱1,000.00/);

for (const question of ["How much can I put towards my next trip?", "How much can we set aside for our vacation?", "How much can I realistically allocate toward travel?"]) {
  assert(classifyAdviserScope(question).allowed, question);
  assert.equal(classifyEverydayQuestion(question), null, question);
  assert.deepEqual(selectAdviserToolNames({question}), ["calculate_safe_to_spend"], question);
  assert.deepEqual(spendingRoomOptions(question), {horizonDays:undefined, additionalBuffer:undefined});
}
assert.equal(classifyAdviserScope("How much can I put in my luggage for the trip?").allowed, false);
const tripReply = spendingRoomReply(room, "How much can I put towards my next trip?");
assert.match(tripReply, /estimated ₱25,000.00/);
assert.match(tripReply, /next 30 days/);
assert.match(tripReply, /Some debt installments are missing/);
assert.match(tripReply, /planning ceiling/);
assert.match(spendingRoomReply({...room, safeToSpend:0, roomAfterProtection:-1000}, "How much can I put towards my next trip?"), /hold off.*₱1,000.00/);

assert.doesNotMatch(tripReply, /\*\*/, "The chat displays plain text, so template replies must not include Markdown emphasis markers.");

const singapore = adviserRegionalContext({ countryCode: "SG", detectionSource: "manual", baseCurrency: "PHP" }, ["USD", "USD", "SGD", "PHP"]);
assert.equal(singapore.dominantCurrency, "USD");
assert.equal(singapore.localCurrency, "SGD");
assert.match(adviserRegionalBudgetReply(singapore, "USD"), /main budget in USD.*Singapore.*separate SGD budget.*public transport/s);
assert.match(adviserRegionalBudgetReply(singapore, "SGD"), /main budget in SGD.*Keep USD, PHP/s);
assert.equal(adviserRegionalContext({ baseCurrency: "GBP", locale: "en-GB", detectionSource: "manual" }, ["EUR", "GBP"]).dominantCurrency, "GBP");
assert.equal(adviserRegionalContext({ locale: "ja-JP", detectionSource: "manual" }, []).countryCode, "JP");
assert.equal(adviserRegionalContext(null, ["EUR"]).countryCode, null);
assert.equal(adviserRegionalContext({ countryCode: "PH", locale: "en-PH", detectionSource: "fallback" }, ["EUR"]).countryCode, null);

const regionalTurns = (...questions: string[]) => questions.map(content => ({ role: "user", content }));
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("How should I budget for living expenses here?", "In SGD", "Show me a chart")), { currency: "SGD", chart: true });
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("How should I budget across currencies with a chart?", "Just the numbers")), { currency: undefined, chart: false });
assert.equal(resolveAdviserRegionalBudget(regionalTurns("How should I budget for living expenses here?", "How much cash do I have?", "Show me a chart")), null);

assert.match(adviserCurrencyExplanation(singapore, "USD", "default"), /2 USD accounts.*SGD/);
assert.match(adviserCurrencyExplanation(singapore, "SGD", "page"), /SGD.*selected on this page/);
assert.match(adviserCurrencyExplanation(singapore, "PHP", "request"), /PHP.*you asked for/);
assert.match(adviserRegionalBudgetReply(singapore, "SGD", true), /local expenses in SGD/);
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("Help me plan a realistic budget", "In USD", "In my local currency", "Show me a chart")), { currency: undefined, useLocalCurrency: true, chart: true });
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("Help me plan a realistic budget", "In my local currency", "In USD")), { currency: "USD", chart: undefined });

assert.equal(resolveAdviserLocalCurrency("Show that in my local currency.", "SGD"), "In SGD");
assert.equal(resolveAdviserLocalCurrency("How much did I spend in my local currency?", "SGD"), "How much did I spend in SGD?");
assert.equal(resolveAdviserLocalCurrency("In my local currency"), null);
assert.equal(resolveAdviserLocalCurrency("What is a local currency account?", "SGD"), "What is a local currency account?");
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("How should I budget for living expenses in my local currency?")), { currency: undefined, useLocalCurrency: true, chart: undefined });

const localizedTurns = regionalTurns("Show my spending by category last month in USD", "In my local currency", "Show me a chart")
  .map(turn => ({ ...turn, content: resolveAdviserLocalCurrency(turn.content, "SGD") ?? turn.content }));
const localizedFact = resolveAdviserFactQuestion(localizedTurns[2].content, localizedTurns);
assert.equal(adviserFactIntent(localizedFact), "spending");
assert.equal(adviserRequestedCurrency(localizedFact), "SGD");
assert.match(localizedFact, /last month/i);

assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("Help me plan a realistic budget in Swiss francs")), { currency: "CHF", chart: undefined });
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("Help me plan a realistic budget", "Show me in Mexican pesos", "Show me a chart")), { currency: "MXN", chart: true });

assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("How should I budget for living expenses in Canada?", "Show me a chart")), {
  currency: undefined, useLocalCurrency: true, countryCode: "CA", chart: true,
});
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("How should I budget in the UK?", "What about Japan?", "In USD")), {
  currency: "USD", countryCode: "JP", chart: undefined,
});
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns("Help me plan a realistic budget in USD", "What about in Mexico?")), {
  currency: undefined, useLocalCurrency: true, countryCode: "MX", chart: undefined,
});
assert.equal(resolveAdviserRegionalBudget(regionalTurns("Tell me about Japan", "What about Canada?")), null);
const canada = adviserBudgetDestination(singapore, "CA");
assert.equal(canada.countryName, "Canada");
assert.equal(canada.localCurrency, "CAD");
assert.equal(canada.dominantCurrency, "USD");
assert.equal(singapore.localCurrency, "SGD");

assert.match(adviserCountryCurrencyAnswer("México").reply, /MXN.*Mexico/);
assert.match(adviserCountryCurrencyAnswer("日本").reply, /JPY.*Japan/);
assert.match(adviserCountryCurrencyAnswer("the UAE").reply, /AED/);
assert.match(adviserCountryCurrencyAnswer("Ivory Coast").reply, /XOF/);
assert.match(adviserCountryCurrencyAnswer("Atlantis").reply, /couldn’t match/);
assert.deepEqual(resolveAdviserCountryCurrency(regionalTurns("What currency should I use in Canada?", "What about Japan?", "How about Mexico?")), { country: "Mexico" });
assert.equal(resolveAdviserCountryCurrency(regionalTurns("Tell me about Canada", "What about Japan?")), null);
assert.deepEqual(resolveAdviserRegionalBudget(regionalTurns(adviserCountryCurrencyAnswer("España").suggestions[0].prompt)), {
  currency: undefined, useLocalCurrency: true, countryCode: "ES", chart: undefined,
});
assert.deepEqual(resolveAdviserCountryCurrency(regionalTurns("What currency is used in Côte d’Ivoire?")), { country: "Côte d’Ivoire" });

assert.equal(resolveAdviserLocalCurrency("Show spending last month in Japan’s currency"), "Show spending last month in JPY");
assert.equal(resolveAdviserLocalCurrency("In the currency used in Côte d’Ivoire"), "in XOF");
assert.equal(resolveAdviserLocalCurrency("What about Canada’s currency?"), "in CAD");
assert.equal(resolveAdviserLocalCurrency("Show cash in Atlantis’s currency"), null);
assert.equal(resolveAdviserLocalCurrency("In my local currency", "SGD"), "In SGD");
const countryCurrencyTurns = regionalTurns("Show my spending by category last month", "What about Canada’s currency?", "Show me a chart")
  .map(turn => ({ ...turn, content: resolveAdviserLocalCurrency(turn.content) ?? turn.content }));
const countryCurrencyFact = resolveAdviserFactQuestion(countryCurrencyTurns[2].content, countryCurrencyTurns);
assert.equal(adviserRequestedCurrency(countryCurrencyFact), "CAD");
assert.match(countryCurrencyFact, /last month/);
