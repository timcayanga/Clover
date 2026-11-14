import assert from "node:assert/strict";
import { correctionMatch } from "../../shared/category-correction";
import { mobileEditSchema } from "../lib/mobile-edit-schema";

const match = (merchantRaw: string, description?: string, type = "expense") =>
  correctionMatch({ merchantRaw, description, type });
const food = match("Grab", "GRAB FOOD");
assert.equal(food?.label, "GrabFood");
assert.equal(food?.key, match("GrabFood")?.key);
assert.notEqual(food?.key, match("Grab", "GrabCar")?.key);
assert.notEqual(food?.key, match("GrabMart")?.key);
assert.notEqual(food?.key, match("GrabFood", undefined, "income")?.key);
assert.equal(match("Grab"), null);
assert.equal(match("Grab", "GrabFood or GrabCar"), null);
assert.equal(match("GrabPay"), null);
assert.equal(match("GrabFood", undefined, "transfer"), null);
assert.equal(match("Bank transaction"), null);
assert.equal(match("Coffee Shop")?.key, match(" COFFEE-SHOP ")?.key);
assert.notEqual(match("Coffee Shop Central")?.key, match("Coffee Shop")?.key);
assert(mobileEditSchema.safeParse({ categoryId: "meals", categoryCorrectionScope: "similar" }).success);
assert(!mobileEditSchema.safeParse({ categoryId: "meals", categoryCorrectionScope: "global" }).success);
console.log("Category scope: Grab service isolation, exact matching, and mobile schema passed");
