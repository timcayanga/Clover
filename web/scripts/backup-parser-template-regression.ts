import assert from "node:assert/strict";
import { buildOpenAIBackupSystemPrompt } from "@/lib/openai-import-parser";

const statementPrompt = buildOpenAIBackupSystemPrompt("statement", true, false);
assert.match(statementPrompt, /backup parser/i);
assert.match(statementPrompt, /Do not invent data/i);
assert.match(statementPrompt, /provided page images directly/i);
assert.match(statementPrompt, /ignore app chrome/i);
assert.match(statementPrompt, /return only the rows supported by visible evidence/i);

const pdfPrompt = buildOpenAIBackupSystemPrompt("statement", false, true);
assert.match(pdfPrompt, /PDF content directly/i);
assert.doesNotMatch(pdfPrompt, /provided page images directly/i);

const portfolioPrompt = buildOpenAIBackupSystemPrompt("portfolio", false, false);
assert.match(portfolioPrompt, /holdings or portfolio document/i);
assert.match(portfolioPrompt, /holdings extraction over inventing ledger transactions/i);

console.log("Backup parser prompt regression checks passed.");
