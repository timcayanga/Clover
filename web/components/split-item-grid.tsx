"use client";
import { SplitBillEntityAvatar } from "./split-bill-entity-avatar";
import {
  splitItemTotals,
  splitMethods,
  type SplitItem,
  type SplitPerson,
} from "../../shared/split-bill-experience";
import { formatSplitBillAmount } from "@/lib/split-bill";
export function SplitItemGrid({
  people,
  items,
  currency,
  onChange,
  adjustment = 0,
  onAddPerson,
}: {
  adjustment?: number;
  onAddPerson?:()=>void;
  people: SplitPerson[];
  items: SplitItem[];
  currency: string;
  onChange?: (items: SplitItem[]) => void;
}) {
  const totals = splitItemTotals(people, items, adjustment);
  const update = (index: number, patch: Partial<SplitItem>) =>
    onChange?.(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  const method = items[0]?.splitMethod ?? "equal";
  return (
    <div className="split-item-editor">
      <div className="split-item-grid-scroll">
        <table className="split-item-grid">
          <thead>
            <tr>
              <th>Item</th>
              {people.map((p) => (
                <th key={p.id}>
                  <SplitBillEntityAvatar
                    name={p.name}
                    avatarUrl={p.avatarUrl ?? null}
                  />
                  <span>{p.name}</span>
                </th>
              ))}
              {onAddPerson?<th><button type="button" className="circle-text-action" aria-label="Add Person" onClick={onAddPerson}>+</button></th>:null}
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id ?? index}>
                <td>
                  {onChange ? (
                    <>
                      <input
                        className="settings-input"
                        aria-label={`Item ${index + 1}`}
                        placeholder="Item name"
                        value={item.description}
                        onChange={(e) =>
                          update(index, { description: e.target.value })
                        }
                      />
                      <input
                        className="settings-input"
                        aria-label={`Amount ${index + 1}`}
                        inputMode="decimal"
                        placeholder="0.00"
                        value={item.amount}
                        onChange={(e) =>
                          update(index, { amount: e.target.value })
                        }
                      />

                    </>
                  ) : (
                    <>
                      <strong>{item.description}</strong>
                      <small>
                        {formatSplitBillAmount(Number(item.amount), currency)}
                      </small>
                    </>
                  )}
                </td>
                {people.map((p) => (
                  <td key={p.id}>
                    <input
                      type="checkbox"
                      aria-label={`${item.description || `Item ${index + 1}`} for ${p.name}`}
                      checked={item.participantIds.includes(p.id)}
                      disabled={!onChange}
                      onChange={(e) =>
                        update(index, {
                          participantIds: e.target.checked
                            ? [...item.participantIds, p.id]
                            : item.participantIds.filter((id) => id !== p.id),
                          allocations: (item.allocations ?? []).filter(
                            (a) => a.participantId !== p.id,
                          ),
                        })
                      }
                    />
                    {item.participantIds.includes(p.id) &&
                    item.splitMethod &&
                    item.splitMethod !== "equal" ? (
                      onChange ? (
                        <input
                          className="settings-input"
                          aria-label={`${p.name} ${item.splitMethod} for ${item.description}`}
                          inputMode="decimal"
                          value={
                            item.allocations?.find(
                              (a) => a.participantId === p.id,
                            )?.value ?? ""
                          }
                          onChange={(e) =>
                            update(index, {
                              allocations: [
                                ...(item.allocations ?? []).filter(
                                  (a) => a.participantId !== p.id,
                                ),
                                { participantId: p.id, value: e.target.value },
                              ],
                            })
                          }
                        />
                      ) : (
                        <small>
                          {
                            item.allocations?.find(
                              (a) => a.participantId === p.id,
                            )?.value
                          }
                          {item.splitMethod === "percentage" ? "%" : ""}
                        </small>
                      )
                    ) : null}
                  </td>
                ))}
                {onChange?<td><button type="button" className="circle-text-action" aria-label={`Remove item ${index+1}`} onClick={()=>onChange(items.filter((_,i)=>i!==index))}>×</button></td>:null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th>To pay</th>
              {people.map((p) => (
                <td key={p.id}>
                  {formatSplitBillAmount(totals[p.id] ?? 0, currency)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      {onChange ? (
        <>
          <button
            type="button"
            className="circle-text-action"
            onClick={() =>
              onChange([
                ...items,
                {
                  id: globalThis.crypto?.randomUUID?.() ?? `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                  description: "",
                  amount: "",
                  participantIds: people.map((p) => p.id),
                  splitMethod: method,
                  allocations: [],
                },
              ])
            }
          >
            + Add Line Item
          </button>
          <section className="split-method-panel">
            <strong>Split Method</strong>
            <div role="group" aria-label="Split method">
              {splitMethods.map((m) => (
                <button
                  type="button"
                  key={m.value}
                  aria-pressed={method === m.value}
                  className={`button button-${method === m.value ? "primary" : "secondary"} button-small`}
                  onClick={() =>
                    onChange(
                      items.length
                        ? items.map((item) => ({
                            ...item,
                            splitMethod: m.value,
                            allocations: [],
                          }))
                        : [
                            {
                              id: crypto.randomUUID(),
                              description: "",
                              amount: "",
                              participantIds: people.map((p) => p.id),
                              splitMethod: m.value,
                              allocations: [],
                            },
                          ],
                    )
                  }
                >
                  <span aria-hidden="true">{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
