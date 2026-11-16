const DAY = 86400000;
const OFFSET = 8 * 3600000;
export function homeDateKey(date: Date) {
  return new Date(+date + OFFSET).toISOString().slice(0, 10);
}
export function mobileHomePeriods(now = new Date()) {
  const local = new Date(+now + OFFSET);
  const day = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) -
      OFFSET,
  );
  const tomorrow = new Date(+day + DAY);
  const month = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET,
  );
  const previousMonth = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1) - OFFSET,
  );
  const rolling = (days: number) => {
    const from = new Date(+tomorrow - days * DAY);
    return {
      from,
      to: tomorrow,
      previousFrom: new Date(+from - days * DAY),
      previousTo: from,
    };
  };
  return { day, tomorrow, month, previousMonth, rolling };
}
