import assert from "node:assert/strict";
import { normalizeMerchantText, tokenizeMerchant } from "@/lib/data-engine";
assert.equal(normalizeMerchantText("스타벅스 강남점"), "스타벅스 강남점");
assert.notEqual(normalizeMerchantText("서울식당"), normalizeMerchantText("부산식당"));
assert.deepEqual(tokenizeMerchant("서울식당"), ["서울식당"]);
assert.equal(normalizeMerchantText("서울식당".normalize("NFD")), "서울식당");
assert.equal(normalizeMerchantText("Coffee Shop!"), "coffee shop");
console.log("Korean merchant learning identity passed.");
