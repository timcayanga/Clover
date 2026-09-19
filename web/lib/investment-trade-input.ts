import { z } from "zod";
const decimal = (places: number) =>
  z.string().regex(new RegExp(`^\\d{1,10}(\\.\\d{1,${places}})?$`));
export const investmentTradeInput = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(0),
    assetName: z.string().trim().min(1).max(120),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          Number.isFinite(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v,
      ),
    kind: z.enum(["buy", "sell", "reinvest", "transfer_in", "transfer_out"]),
    quantity: decimal(8).refine((v) => Number(v) > 0),
    amount: decimal(2),
    costBasis: decimal(2),
    note: z.string().trim().max(1000),
  })
  .strict();
export type InvestmentTradeInput = z.infer<typeof investmentTradeInput>;
// Cost basis is supplied explicitly, including any fees the user capitalizes.
// Sale proceeds are not cost basis, and transfers are not income/expenses.
export function tradeSigns(kind: InvestmentTradeInput["kind"]) {
  return kind === "sell" || kind === "transfer_out" ? -1 : 1;
}
