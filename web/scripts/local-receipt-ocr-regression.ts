import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  encodeLocalReceiptOcr,
  readLocalReceiptOcrText,
} from "../lib/local-receipt-ocr-envelope";
import { normalizeLocalReceiptOcrText } from "../lib/local-receipt-ocr-normalization";
import {
  parseReceiptText,
  assessReceiptPreviewQuality,
} from "../lib/split-bill";
const require = createRequire(import.meta.url);
const { rows, modelDictionary } = require("../lib/receipt-ocr-worker.cjs");
const wrap = (text: string) =>
  encodeLocalReceiptOcr({
    engine: "ppocr-v5-local",
    text,
    confidence: 0.99,
    lines: [
      {
        text: "audit only 999999",
        confidence: 0.99,
        box: [
          [0, 0],
          [200, 0],
          [200, 10],
          [0, 10],
        ],
      },
    ],
  });
const check = (text: string, total: string | null) => {
  const encoded = wrap(text),
    parsed = parseReceiptText(encoded);
  assert.equal(parsed.total, total, text);
  assert.equal(parsed.receiptText, encoded, "raw optical evidence retained");
  assert.equal(parsed.requiresReview, true);
  assert.equal(assessReceiptPreviewQuality(parsed).reliableForFastPath, false);
  return parsed;
};
assert.equal(readLocalReceiptOcrText(wrap("TL 18,000")), "TL 18,000");
assert.equal(readLocalReceiptOcrText("Total 12,000"), null);
assert.equal(
  readLocalReceiptOcrText("[[CLOVER_LOCAL_RECEIPT_OCR_V1]]\nmalformed"),
  "",
);
check(
  "TOTAL 17,000\nGRAND TOTAL 18,000\nTUNAI 20,000\nKEMBALI 2,000",
  "18000.00",
);
assert.equal(
  check("TOTAL 17,000\nGrand Totar 18, 000", "18000.00").currency,
  "MIXED",
);
check("TOTAL 17,000\nGRAND TOTAL 18,000\nGRAND TOTAL 19,000", null);
check("TOTAL 17,000\nGRAND TOTAL ???", null);
check("Grand Totar 18,000\nGRAND TOTAL 19,000", null);
check("Refund\nTOTAL 17,000\nGrand TotaI 18,000", null);
check("결제약 8,240\n과세물품가액 8,240", "8240.00");
check('결제"의 8,240\n정상판매(8,240원)', "8240.00");
check("결제약 8,240\n과세물품가액 8,250", null);
check("결제약 8,240\n영수증번호 128,240", null);
check("결제약 8,240\n합계 9,000\n과세물품가액 8,240", "9000.00");
check("환불영수증\n결제약 8,240\n과세물품가액 8,240", null);
assert.equal(
  normalizeLocalReceiptOcrText("Grand Total item 3\n결제카드 8,240\n8,240"),
  "Grand Total item 3\n결제카드 8,240\n8,240",
);
assert.equal(
  normalizeLocalReceiptOcrText("Total 12O,000\nTax 3.5\nSKU 123 456 789"),
  "Total 12O,000\nTax 3.5\nSKU 123 456 789",
  "never repair digits",
);
// Tilted three-row receipt: raw y on the right overlaps the next label.
const line = (text: string, x: number, y: number, width: number) => ({
  text,
  confidence: 0.99,
  box: [
    [x, y],
    [x + width, y + width * 0.1],
    [x + width, y + width * 0.1 + 14],
    [x, y + 14],
  ],
});
const tilted = [
  line("TAX", 0, 20, 80),
  line("1,000", 300, 50, 80),
  line("GRAND TOTAL", 0, 40, 100),
  line("11,000", 300, 70, 80),
  line("CASH", 0, 60, 90),
  line("20,000", 300, 90, 80),
];
assert.equal(
  rows(tilted.reverse()),
  "TAX 1,000\nGRAND TOTAL 11,000\nCASH 20,000",
);
// Embedded alphabet must preserve Unicode and remove the terminal newline,
// otherwise every CTC output index maps to the wrong character.
const field = (id: number, value: Buffer) =>
  Buffer.concat([Buffer.from([id * 8 + 2, value.length]), value]);
const metadata = field(
  14,
  Buffer.concat([
    field(1, Buffer.from("character")),
    field(2, Buffer.from("가\nA\n0\n")),
  ]),
);
assert.deepEqual(modelDictionary(metadata), ["", "가", "A", "0", " "]);
assert.throws(() => modelDictionary(Buffer.from([114, 99, 1])), /Invalid/);
console.log(
  "Local receipt OCR: geometry, alphabet integrity, exact amount preservation, conflict/refund handling, raw audit and mandatory review passed.",
);
