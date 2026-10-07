// Each app supplies its own React hook; shared code must not resolve app dependencies.
type StateHook = <T>(
  initial: T | (() => T),
) => [T, (value: T | ((current: T) => T)) => void];
import type { RecoveryCandidate } from "./workspace";
export type RecoveryRequest = <T>(query: string, body?: object) => Promise<T>;
type Page = { candidates: RecoveryCandidate[]; nextOffset: number | null };
export function useRecoveryEditor(
  useState: StateHook,
  request: RecoveryRequest,
  currency: string,
  onChanged?: () => void | Promise<unknown>,
) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [kind, setKind] = useState<"refund" | "reimbursement">("refund"),
    [amount, setAmount] = useState("");
  const [expense, setExpense] = useState<RecoveryCandidate | null>(null),
    [incoming, setIncoming] = useState<RecoveryCandidate | null>(null);
  const [queries, setQueries] = useState({ expense: "", income: "" });
  const [pages, setPages] = useState<{ expense: Page; income: Page }>({
    expense: { candidates: [], nextOffset: null },
    income: { candidates: [], nextOffset: null },
  });
  async function load(type: "expense" | "income", more = false) {
    setBusy(true);
    setError("");
    try {
      const offset = more ? (pages[type].nextOffset ?? 0) : 0;
      const p = await request<Page>(
        new URLSearchParams({
          type,
          currency,
          q: queries[type],
          offset: String(offset),
        }).toString(),
      );
      setPages((old) => ({
        ...old,
        [type]: {
          ...p,
          candidates: more
            ? [...old[type].candidates, ...p.candidates]
            : p.candidates,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to find transactions.");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setOpen(true);
    setNotice("");
    setBusy(true);
    setError("");
    try {
      const [expense, income] = await Promise.all(
        ["expense", "income"].map((type) =>
          request<Page>(new URLSearchParams({ type, currency }).toString()),
        ),
      );
      setPages({ expense, income });
      setQueries({ expense: "", income: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to find transactions.");
    } finally {
      setBusy(false);
    }
  }
  function choose(type: "expense" | "income", row: RecoveryCandidate) {
    if (type === "expense") setExpense(row);
    else setIncoming(row);
    const other = type === "expense" ? incoming : expense;
    if (other) setAmount(String(Math.min(other.available, row.available)));
  }
  async function mutate(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("", body);
      setOpen(false);
      setExpense(null);
      setIncoming(null);
      setAmount("");
      setNotice("Reporting link updated.");
      await onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update this link.");
    } finally {
      setBusy(false);
    }
  }
  return {
    open,
    busy,
    error,
    notice,
    kind,
    setKind,
    amount,
    setAmount,
    expense,
    incoming,
    queries,
    pages,
    start,
    load,
    choose,
    setQuery: (type: "expense" | "income", q: string) => {
      setQueries((old) => ({ ...old, [type]: q }));
      setPages((old) => ({
        ...old,
        [type]: { candidates: [], nextOffset: null },
      }));
    },
    cancel: () => {
      setOpen(false);
      setError("");
    },
    save: () =>
      mutate({
        action: "create",
        expenseId: expense?.id,
        incomingId: incoming?.id,
        kind,
        amount: Number(amount),
      }),
    remove: (id: string) => mutate({ action: "delete", id }),
    canSave:
      !!expense &&
      !!incoming &&
      Number(amount) > 0 &&
      Number(amount) <= Math.min(expense.available, incoming.available) &&
      !busy,
  };
}
