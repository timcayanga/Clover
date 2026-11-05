/** Calendar dates stay dates; do not let UTC parsing move a due date back a day. */
export function calendarDay(value: string) {
  const key = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const day = Date.parse(`${key}T12:00:00Z`);
  return Number.isFinite(day) && new Date(day).toISOString().slice(0, 10) === key ? day : null;
}
export function paymentCountdown(due: string, today: string): string | null {
  const date = calendarDay(due), now = calendarDay(today);
  if (date === null || now === null) return null;
  const days = Math.round((date - now) / 86400000);
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  if (days > 1) return `${days} days left`;
  return `${-days} ${days === -1 ? 'day' : 'days'} overdue`;
}
export function dateInTimeZone(now = new Date(), timeZone = 'Asia/Manila'): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone, year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get = (type: string) => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch { return now.toISOString().slice(0, 10); }
}
export function shortPaymentDate(value: string): string | null {
  const day = calendarDay(value);
  return day === null ? null : new Intl.DateTimeFormat('en', {month:'short', day:'numeric', timeZone:'UTC'}).format(day);
}
export function greetingName(firstName?: string | null) {
  const name = firstName?.trim().split(/\s+/)[0];
  return name ? `Hi, ${name}!` : 'Hi there!';
}
