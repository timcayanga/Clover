import assert from "node:assert/strict";
import { proposeContextCorpusCandidates } from "@/lib/context-corpus-learning";

const candidate = proposeContextCorpusCandidates([
  { merchantClean: "Neighborhood Cafe", categoryName: "Food & Dining", type: "expense", currency: "PHP", reviewStatus: "confirmed" },
  { merchantClean: "Neighborhood Cafe", categoryName: "Food & Dining", type: "expense", currency: "PHP", reviewStatus: "edited" },
  { merchantClean: "Neighborhood Cafe", categoryName: "Food & Dining", type: "expense", currency: "PHP", reviewStatus: "confirmed" },
]);
assert.equal(candidate.length, 1);
assert.equal(candidate[0]?.reviewStatus, "candidate");
assert.equal(candidate[0]?.source, "learned");
assert.equal(candidate[0]?.observationCount, 3);
assert.equal(candidate[0]?.confidence, 61);

const rejected = proposeContextCorpusCandidates([
  { merchantClean: "One Off Shop", categoryName: "Shopping", type: "expense", reviewStatus: "rejected" },
  { merchantClean: "One Off Shop", categoryName: "Shopping", type: "expense", reviewStatus: "confirmed" },
  { merchantClean: "One Off Shop", categoryName: "Shopping", type: "expense", reviewStatus: "confirmed" },
]);
assert.equal(rejected.length, 0);

const conflict = proposeContextCorpusCandidates([
  { merchantClean: "Global Store", categoryName: "Shopping", type: "expense", currency: "PHP", countryCode: "PH", reviewStatus: "confirmed" },
  { merchantClean: "Global Store", categoryName: "Shopping", type: "expense", currency: "USD", countryCode: "US", reviewStatus: "confirmed" },
  { merchantClean: "Global Store", categoryName: "Shopping", type: "expense", currency: "USD", countryCode: "US", reviewStatus: "confirmed" },
]);
assert.equal(conflict.length, 1);
assert.equal(conflict[0]?.countryCode, null);
assert.equal(conflict[0]?.evidence.includes("conflicting-country-evidence"), true);

console.log("context corpus learning regression passed");
