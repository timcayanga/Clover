import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  encodeLocalReceiptOcr,
  readLocalReceiptOcrText,
  replaceLocalReceiptOcrText,
  refineReceiptItemWords,
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

const original = wrap("TL 18,000");
const edited = replaceLocalReceiptOcrText(original, "TL 19,000");
assert.equal(readLocalReceiptOcrText(edited), "TL 19,000");
assert.equal(edited.slice(0, edited.indexOf("[[OCR_TEXT]]")), original.slice(0, original.indexOf("[[OCR_TEXT]]")), "editing displayed text preserves raw OCR evidence");
assert.equal(replaceLocalReceiptOcrText("manual text", "new notes"), "new notes");

const { corroborateWords } = require("../lib/receipt-ocr-worker.cjs");
const box = {};
const best = { text: "ROASTED CAPROT", confidence: 0.96, box };
const other = { text: "ROASTED CARROT" };
const witness = { text: "ROASTED CARROT", confidence: 0.93 };
assert.equal(corroborateWords(best, other, witness, new Map()).text, other.text);
assert.equal(corroborateWords(best, best, witness, new Map()), best);
assert.equal(corroborateWords(best, best, witness, new Map([["carrot", new Set([box])]])), best);
assert.equal(corroborateWords(best, best, witness, new Map([["carrot", new Set([{}])]])).text, other.text);
const splitWord = { ...best, text: "Blue berry tart" };
const joinedWord = { ...other, text: "Blueberry tart", confidence: 0.95 };
assert.equal(corroborateWords(splitWord, joinedWord, joinedWord, new Map()).text, joinedWord.text);
assert.equal(corroborateWords(splitWord, joinedWord, splitWord, new Map()), splitWord);
assert.equal(corroborateWords(splitWord, { ...joinedWord, confidence: 0.4 }, joinedWord, new Map()), splitWord);
assert.equal(corroborateWords({ ...best, text: "ITEM 58" }, other, witness, new Map()).text, "ITEM 58");
const receipt = wrap("Cafe\nOfficial Receipt\n2026-11-19\nQty Item Description Amount\n1 ROASTED CAPROT 25.00\n1 Coffee 10.00\nSubtotal 35.00\nTotal Amount 35.00");
const raw = readLocalReceiptOcrText(receipt)!;
const supported = encodeLocalReceiptOcr({ engine: "ppocr-v5-local", text: raw, itemWordCorrections: [{ original:best.text, corrected:other.text }] });
assert.equal(parseReceiptText(supported).items[0].description, "ROASTED CARROT");
assert.equal(parseReceiptText(supported).total, "35.00");
assert.equal(readLocalReceiptOcrText(parseReceiptText(supported).receiptText), raw);

for (const [printed, corrected] of [["Café. Glass", "Café, Glass"], ["Éclalr", "Éclair"], ["Choclate tart", "Chocolate tart"], ["Cherry cake (S mall)", "Cherry cake (Small)"]]) {
  const primary = { text: printed, confidence: .96 };
  const witness = { text: corrected, confidence: .93 };
  assert.equal(corroborateWords(primary, witness, witness, new Map()).text, corrected);
  assert.equal(corroborateWords(primary, witness, primary, new Map()), primary);
  const evidence = encodeLocalReceiptOcr({ engine: "ppocr-v5-local", text: printed,
    itemWordCorrections: [{ original: printed, corrected }] });
  assert.equal(refineReceiptItemWords(evidence, [{ description: printed }])[0].description, corrected);
}
const decimal = { text: "Tea 12.50", confidence: .96 };
const altered = { text: "Tea 12,50", confidence: .95 };
assert.equal(corroborateWords(decimal, altered, altered, new Map()), decimal);
const wrappedItem = encodeLocalReceiptOcr({ engine: "ppocr-v5-local", text: "SALAD CAPROT",
  itemWordCorrections: [
    { original: "CAPROT", corrected: "CARROT" }, { original: "CARROT", corrected: "PARROT" },
    { original: "SALAD", corrected: "SALAT" },
  ],
});
assert.deepEqual(refineReceiptItemWords(wrappedItem, [{ description: "SALAD CAPROT", amount: "4.50" }]),
  [{ description: "SALAT CARROT", amount: "4.50" }]);

const { mostLikelyClass } = require("../lib/receipt-ocr-worker.cjs");
for (const values of [[.9,.05,.05], [.1,.2,.7], [.4,.4,.2], [.2,.3,.5], [.34,.33,.33]]) {
  const row = Float32Array.from(values);
  const padded = Float32Array.from([0, ...row]);
  assert.equal(mostLikelyClass(padded, 1, row.length), row.indexOf(Math.max(...row)));
}
const { tensor } = require("../lib/receipt-ocr-worker.cjs");
const pixels = Uint8Array.from({ length: 256 * 3 }, (_, i) => i % 256);
for (const [detection, normalize] of [[true,true],[false,true],[false,false]]) {
  const input = tensor(pixels, 256, 1, detection, 260, normalize);
  for (let c = 0; c < 3; c++) {
    const mean = detection ? [0.485,0.456,0.406][c] : 0.5;
    const deviation = detection ? [0.229,0.224,0.225][c] : 0.5;
    for (let x = 0; x < 256; x++) {
      const v = Math.fround((pixels[x*3 + 2-c] / 255 - mean) / deviation);
      assert.equal(input.data[c*260+x], normalize ? v : Math.fround((v+1)/2));
    }
    assert.equal(input.data[c*260+259], 0);
  }
  input.dispose();
}

const { agreedWordLine } = require("../lib/receipt-ocr-worker.cjs");
const clearWord = {text: "Black Tea", minConfidence: .99};
assert.ok(agreedWordLine(clearWord, clearWord));
assert.ok(!agreedWordLine(clearWord, {...clearWord, text: "Black Pea"}));
assert.ok(!agreedWordLine(clearWord, {...clearWord, minConfidence: .7}));
assert.ok(!agreedWordLine(clearWord, undefined));
for (const text of ["125.00", "Tea 2"]) {
  assert.ok(!agreedWordLine({...clearWord, text}, {...clearWord, text}));
}
