// Presentation only: never used to categorize or change financial records.
export const budgetIcons = [
  { emoji: "🛒", label: "Groceries", color: "#247557", terms: /grocer|supermarket|market/iu },
  { emoji: "🍔", label: "Food", color: "#986024", terms: /food|dining|restaurant|eating|meal/iu },
  { emoji: "☕", label: "Coffee", color: "#805741", terms: /coffee|cafe|café/iu },
  { emoji: "🏠", label: "Home", color: "#977047", terms: /home|rent|house|mortgage/iu },
  { emoji: "✈️", label: "Travel", color: "#377896", terms: /travel|flight|holiday|vacation|trip/iu },
  { emoji: "🚙", label: "Transport", color: "#356d9c", terms: /transport|car|fuel|petrol|commut|taxi/iu },
  { emoji: "🛍️", label: "Shopping", color: "#9b487b", terms: /shop|cloth|fashion/iu },
  { emoji: "💡", label: "Utilities", color: "#8b741c", terms: /utilit|electric|water|internet|phone/iu },
  { emoji: "📚", label: "Education", color: "#41795d", terms: /educat|school|tuition|book|course/iu },
  { emoji: "💊", label: "Health", color: "#9b4c50", terms: /health|medic|pharma|doctor/iu },
  { emoji: "🎬", label: "Entertainment", color: "#595577", terms: /entertain|movie|cinema|stream|subscription/iu },
  { emoji: "🐾", label: "Pets", color: "#796047", terms: /pet|dog|cat food|vet/iu },
  { emoji: "🎁", label: "Gifts", color: "#9a465b", terms: /gift|donat|charity/iu },
  { emoji: "🏋️", label: "Fitness", color: "#546b81", terms: /gym|fitness|sport/iu },
  { emoji: "🌱", label: "Savings", color: "#377b48", terms: /sav|emergency|invest|retire/iu },
  { emoji: "💳", label: "Payments", color: "#877323", terms: /credit|loan|debt|payment/iu },
  { emoji: "🎯", label: "Target", color: "#a3464d", terms: /goal|target/iu },
  { emoji: "💰", label: "Budget", color: "#8a7427", terms: /budget|spend|money/iu },
] as const;

export function getBudgetAppearance(budget: { name: string; categoryName?: string | null; emoji?: string | null; kind?: string }) {
  return budgetIcons.find((icon) => icon.emoji === budget.emoji)
    ?? budgetIcons.find((icon) => icon.terms.test(budget.name))
    ?? budgetIcons.find((icon) => icon.terms.test(budget.categoryName ?? ""))
    ?? budgetIcons[budget.kind === "savings_target" ? 14 : 17];
}

export function isBudgetEmoji(value: string) {
  return budgetIcons.some((icon) => icon.emoji === value);
}
