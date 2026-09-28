/** Contextual hints are examples only, never submitted as user input. */
export function entryExample(kind?: string) {
  switch (kind) {
    case "account": case "accounts": return "e.g. BPI Savings";
    case "investment": case "investments": return "e.g. 10 BPI shares";
    case "trade": return "e.g. Bought 10 BPI shares";
    case "recurring": return "e.g. Rent 15,000 every month";
    case "split": return "e.g. Dinner 1,500 split with Ana";
    case "budgeting": return "e.g. Food budget 5,000 per month";
    case "goals": return "e.g. Save 50,000 for a holiday";
    default: return "e.g. 500 at Mendokoro";
  }
}
