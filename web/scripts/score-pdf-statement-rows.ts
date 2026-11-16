import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Supply one JSON array per document. Use ISO dates, a raw description,
// currency, and an exact signed decimal string. Include a stable local account
// label on both sides when scoring a consolidated statement.
type Row = {
  date: string | null;
  description: string | null;
  currency: string | null;
  signedAmount: string | null;
  account?: string | null;
};
type LabeledRow = Row & { occurrence: number };
const fields = ["date", "description", "currency", "signedAmount", "account"] as const;

function decimal(value: string | null) {
  if (value === null) return null;
  assert.equal(typeof value, "string", "Use decimal strings for signed amounts");
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  assert.ok(match, "Invalid signed decimal");
  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").replace(/0+$/, "");
  return (match[1] === "-" && (whole !== "0" || fraction) ? "-" : "") +
    whole + (fraction ? "." + fraction : "");
}

function normalize(row: Row): Required<Row> {
  return {
    date: row.date?.trim() || null,
    description: row.description?.normalize("NFKC").replace(/\s+/gu, " ").trim().toUpperCase() || null,
    currency: row.currency?.trim().toUpperCase() || null,
    signedAmount: decimal(row.signedAmount ?? null),
    account: row.account?.trim() || null,
  };
}

export function scorePdfStatementRows(expected: LabeledRow[], actual: Row[]) {
  const compareAccounts = expected.some(row => row.account !== undefined);
  const enumerate = (rows: Row[]) => {
    const counts = new Map<string, number>();
    return rows.map((row, index) => {
      const normalized = normalize(row);
      if (!compareAccounts) normalized.account = null;
      const identity = JSON.stringify(normalized);
      const occurrence = (counts.get(identity) ?? 0) + 1;
      counts.set(identity, occurrence);
      return { row: index + 1, occurrence, normalized, key: JSON.stringify([identity, occurrence]) };
    });
  };
  const labels = enumerate(expected);
  for (const [index, label] of labels.entries()) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(label.normalized.date ?? "") && label.normalized.description &&
      /^[A-Z]{3}$/.test(label.normalized.currency ?? "") &&
      label.normalized.signedAmount !== null && (!compareAccounts || label.normalized.account),
      `Label ${index + 1} is missing required row evidence`);
    assert.equal(expected[index].occurrence, label.occurrence, `Incorrect label occurrence on row ${index + 1}`);
  }
  const parsed = enumerate(actual);
  const labelKeys = new Set(labels.map(row => row.key));
  const parsedKeys = new Set(parsed.map(row => row.key));
  const missing = labels.filter(row => !parsedKeys.has(row.key));
  const extra = parsed.filter(row => !labelKeys.has(row.key));
  const matched = labels.length - missing.length;
  const differences = (a: typeof labels[number], b: typeof labels[number]) =>
    fields.filter(field => a.normalized[field] !== b.normalized[field]);
  // Only propose a field error if the one-field pairing is unique on both sides.
  const candidates = missing.flatMap(label => extra.flatMap(row => {
    const fields = differences(label, row);
    return fields.length === 1 ? [{ expectedRow: label.row, actualRow: row.row, field: fields[0] }] : [];
  }));
  const expectedPairCounts = new Map<number, number>();
  const actualPairCounts = new Map<number, number>();
  for (const pair of candidates) {
    expectedPairCounts.set(pair.expectedRow, (expectedPairCounts.get(pair.expectedRow) ?? 0) + 1);
    actualPairCounts.set(pair.actualRow, (actualPairCounts.get(pair.actualRow) ?? 0) + 1);
  }
  const fieldMismatches = candidates.filter(pair =>
    expectedPairCounts.get(pair.expectedRow) === 1 && actualPairCounts.get(pair.actualRow) === 1);
  return {
    expected: expected.length, parsed: actual.length, matched,
    recall: expected.length ? matched / expected.length : null,
    precision: actual.length ? matched / actual.length : null,
    missing: missing.map(({ row, occurrence }) => ({ row, occurrence })),
    extra: extra.map(({ row, occurrence }) => ({ row, occurrence })),
    fieldMismatches,
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [expectedPath, actualPath] = process.argv.slice(2);
  assert.ok(expectedPath && actualPath, "Usage: tsx scripts/score-pdf-statement-rows.ts labels.json parsed.json");
  const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as LabeledRow[];
  const actual = JSON.parse(readFileSync(actualPath, "utf8")) as Row[];
  assert.ok(Array.isArray(expected) && Array.isArray(actual), "Expected two JSON row arrays");
  const report = scorePdfStatementRows(expected, actual);
  console.log(JSON.stringify(report, null, 2));
  if (report.missing.length || report.extra.length) process.exitCode = 1;
}
