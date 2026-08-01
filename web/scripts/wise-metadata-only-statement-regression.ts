import assert from "node:assert/strict";
import { isTrustedMetadataOnlyWiseStatement } from "@/lib/metadata-only-statement";

const wiseEurMetadata = {
  institution: "Wise",
  accountNumber: null,
  accountName: "Wise",
  accountType: "wallet" as const,
  currency: "EUR",
  openingBalance: null,
  endingBalance: 0,
  startDate: "2026-01-01",
  endDate: "2026-06-30",
  confidence: 85,
};

assert.equal(
  isTrustedMetadataOnlyWiseStatement({
    fileName: "EUR_2026-01-01_2026-06-30.pdf",
    fileType: "application/pdf",
    importMode: "statement",
    rowCount: 0,
    metadata: wiseEurMetadata,
  }),
  true,
  "A high-confidence zero-activity Wise PDF should publish its currency account instead of retrying forever."
);

assert.equal(
  isTrustedMetadataOnlyWiseStatement({
    fileName: "unknown.pdf",
    fileType: "application/pdf",
    importMode: "statement",
    rowCount: 0,
    metadata: { ...wiseEurMetadata, institution: "Unknown Bank" },
  }),
  false,
  "An unfamiliar empty statement must not create an account automatically."
);

assert.equal(
  isTrustedMetadataOnlyWiseStatement({
    fileName: "wise.pdf",
    fileType: "application/pdf",
    importMode: "statement",
    rowCount: 0,
    metadata: { ...wiseEurMetadata, endingBalance: null },
  }),
  false,
  "Wise metadata without an ending-balance anchor must remain reviewable."
);

console.info("Wise metadata-only statement regression passed.");
