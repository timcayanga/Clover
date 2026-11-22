import { personLedger, netDebtLabel } from "../../shared/split-person-ledger";
import { CategoryBrandMark } from "./category-brand-mark";
import { formatSplitBillAmount } from "@/lib/split-bill";

export function PersonBillTable({
  ledger,
  name,
  onBill,
}: {
  ledger: ReturnType<typeof personLedger>;
  name: string;
  onBill: (id: string) => void;
}) {
  if (!ledger.rows.length) return <p>No shared bills yet.</p>;
  return (
    <>
      <table className="split-person-ledger">
        <thead>
          <tr>
            <th>Bill</th>
            <th>Owed</th>
            <th>Owes</th>
            <th aria-label="Bill actions" />
          </tr>
        </thead>
        <tbody>
          {ledger.rows.map((b) => (
            <tr key={b.id}>
              <td>
                <div className="split-person-bill-name">
                  <CategoryBrandMark
                    categoryName={b.categoryName || "Uncategorized"}
                    size={20}
                  />
                  <strong>{b.title}</strong>
                </div>
                {b.items.map((item, index) => (
                  <small key={index}>
                    {item.name} ·{" "}
                    {formatSplitBillAmount(item.amount, b.currency)}
                  </small>
                ))}
              </td>
              <td>
                {b.owed ? formatSplitBillAmount(b.owed / 100, b.currency) : "—"}
              </td>
              <td>
                {b.owes ? formatSplitBillAmount(b.owes / 100, b.currency) : "—"}
              </td>
              <td>
                <button
                  type="button"
                  aria-label={`Open ${b.title} details`}
                  onClick={() => onBill(b.id)}
                >
                  •••
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          {ledger.totals.map((t) => (
            <tr key={t.currency}>
              <th>Total{ledger.totals.length > 1 ? " · " + t.currency : ""}</th>
              <td>{formatSplitBillAmount(t.owed / 100, t.currency)}</td>
              <td>{formatSplitBillAmount(t.owes / 100, t.currency)}</td>
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
      {ledger.totals.some((t) => t.net) ? (
        ledger.totals
          .filter((t) => t.net)
          .map((t) => (
            <p key={t.currency}>
              {netDebtLabel(
                name,
                t.net,
                formatSplitBillAmount(Math.abs(t.net) / 100, t.currency),
              )}
            </p>
          ))
      ) : (
        <p>All settled.</p>
      )}
    </>
  );
}
