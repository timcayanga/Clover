import { strict as assert } from "node:assert";
import { buildUploadedAccountDedupeKey, buildUploadedAccountLastFourDedupeKey } from "@/lib/imported-account-identity";

const creditCardKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const formattedCreditCardKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279-3411-3868-1014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const bankKey = buildUploadedAccountDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279-3411-3868-1014",
  type: "bank",
  currency: "PHP",
  source: "upload",
});

const suffixOnlyCreditCardKey = buildUploadedAccountLastFourDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "credit_card",
  currency: "PHP",
  source: "upload",
});

const suffixOnlyBankKey = buildUploadedAccountLastFourDedupeKey({
  name: "RCBC 1014",
  institution: "RCBC",
  accountNumber: "4279341138681014",
  type: "bank",
  currency: "PHP",
  source: "upload",
});

assert.equal(
  creditCardKey,
  formattedCreditCardKey,
  "Uploaded-account dedupe should collapse matching RCBC card identities despite formatting differences."
);

assert.notEqual(
  creditCardKey,
  bankKey,
  "Uploaded-account dedupe must not collapse a mismatched bank account into the RCBC credit card."
);

assert.equal(
  suffixOnlyCreditCardKey,
  buildUploadedAccountDedupeKey({
    name: "RCBC 1014",
    institution: "RCBC",
    accountNumber: "1014",
    type: "credit_card",
    currency: "PHP",
    source: "upload",
  }),
  "Last-four account repair should still match the same RCBC credit card identity."
);

assert.notEqual(
  suffixOnlyCreditCardKey,
  suffixOnlyBankKey,
  "Last-four repair matching must stay scoped by account type."
);

console.log("uploaded-account-dedupe-regression: ok");
