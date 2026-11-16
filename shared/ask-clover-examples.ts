export const askCloverExamples = [
  {
    id: "sweldo",
    group: "transactions",
    label: "Where did my sweldo go?",
    reply: "You spent ₱14,000 last month. Rent was the biggest expense at ₱9,000.",
    chart: "Last month’s spending",
    bars: [
      { label: "Rent", amount: 9000 },
      { label: "Food", amount: 3500 },
      { label: "Transport", amount: 1500 },
    ],
    recordsLabel: "Sample transactions",
    records: ["October rent · ₱9,000", "Groceries and meals · ₱3,500", "Commutes · ₱1,500"],
  },
  {
    id: "payday",
    group: "recurring",
    label: "Which bills are due before payday?",
    reply: "Two confirmed bills totaling ₱2,400 are due before your Nov 15 payday.",
    chart: "Due before Nov 15",
    bars: [
      { label: "Nov 10", amount: 1500 },
      { label: "Nov 12", amount: 900 },
    ],
    recordsLabel: "Sample recurring bills",
    records: ["Electricity · Nov 10 · ₱1,500", "Internet · Nov 12 · ₱900"],
  },
  {
    id: "gcash",
    group: "accounts",
    label: "How much did I spend through GCash last month?",
    reply: "You spent ₱1,200 through GCash last month, excluding wallet top-ups.",
    chart: "Last month’s GCash spending",
    bars: [
      { label: "Groceries", amount: 800 },
      { label: "Food", amount: 400 },
    ],
    recordsLabel: "Sample GCash transactions",
    records: ["Groceries · Oct 9 · ₱800", "Lunch · Oct 13 · ₱400"],
  },
] as const;

export const askCloverStarterPrompts = askCloverExamples.map(({ id, group, label }) => ({
  id: `everyday-${id}`, group, label, prompt: label,
}));

export const formatAskExampleAmount = (amount: number) => `₱${amount.toLocaleString("en-PH")}`;

export const askCloverCorePrompts = [
  { id: "core-spending", group: "transactions", label: "Where did my money go?" },
  { id: "core-payday", group: "recurring", label: "What’s due before payday?" },
  { id: "core-available", group: "accounts", label: "How much do I have available?" },
].map(item => ({ ...item, prompt: item.label }));
