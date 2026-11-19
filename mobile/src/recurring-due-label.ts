/** Prefer a generated occurrence; never invent an exact next due date. */
export function recurringDueLabel(item: {id: string; nextDueDate?: string | null; dueDate?: string | null; date?: string | null; recurrence?: string}, occurrences: {id: string; date: string; completed: boolean}[], today = new Date().toISOString().slice(0, 10)) {
  const occurrence = occurrences.filter(row => row.id === item.id && !row.completed && row.date.slice(0, 10) >= today).sort((a,b) => a.date.localeCompare(b.date))[0];
  const date = occurrence?.date ?? item.nextDueDate ?? item.dueDate ?? item.date;
  if (!date) return "Due date not set";
  const day = date.slice(0, 10);
  if (day >= today) return `Due around ${day}`;
  return item.recurrence && item.recurrence !== "none" ? `Schedule from ${day} · ${item.recurrence}` : `Due ${day}`;
}
