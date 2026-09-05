import { Prisma } from "@prisma/client";
const { Decimal } = Prisma;

// Next's Data Cache JSON-serializes results. Encode before Date/Decimal.toJSON
// runs, then restore on BOTH misses and hits so callers receive the same types.
// Every object is an entries node; user JSON can never impersonate a type tag.
export type SummaryCacheValue =
  | ["value", string | number | boolean | null]
  | ["date" | "decimal" | "bigint" | "number", string]
  | ["undefined"]
  | ["array", SummaryCacheValue[]]
  | ["object", Array<[string, SummaryCacheValue]>];

export function encodeSummaryCacheValue(value: unknown): SummaryCacheValue {
  if (value === undefined) return ["undefined"];
  if (value instanceof Date) return ["date", String(value.getTime())];
  if (Decimal.isDecimal(value)) return ["decimal", value.toString()];
  if (typeof value === "bigint") return ["bigint", value.toString()];
  if (typeof value === "number" && (!Number.isFinite(value) || Object.is(value, -0))) {
    return ["number", Object.is(value, -0) ? "-0" : String(value)];
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return ["value", value];
  }
  if (Array.isArray(value)) return ["array", value.map(encodeSummaryCacheValue)];
  if (typeof value === "object") {
    return ["object", Object.entries(value).map(([key, item]) => [key, encodeSummaryCacheValue(item)])];
  }
  throw new TypeError(`Unsupported summary cache value: ${typeof value}`);
}

export function decodeSummaryCacheValue(value: SummaryCacheValue): unknown {
  switch (value[0]) {
    case "value": return value[1];
    case "date": return new Date(Number(value[1]));
    case "decimal": return new Decimal(value[1]);
    case "bigint": return BigInt(value[1]);
    case "number": return Number(value[1]);
    case "undefined": return undefined;
    case "array": return value[1].map(decodeSummaryCacheValue);
    case "object": return Object.fromEntries(value[1].map(([key, item]) => [key, decodeSummaryCacheValue(item)]));
  }
}
