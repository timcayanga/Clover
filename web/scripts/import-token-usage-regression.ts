import assert from "node:assert/strict";
import { estimateLocalParserTokens } from "../lib/import-token-usage";

assert.deepEqual(estimateLocalParserTokens(""), {
  estimatedTokens: 0,
  characters: 0,
  utf8Bytes: 0,
  method: "utf8_bytes_div_4_v1",
});
assert.equal(estimateLocalParserTokens("12345678").estimatedTokens, 2);
assert.equal(estimateLocalParserTokens("₱").utf8Bytes, 3);
console.log("Import token usage regression checks passed.");
