export const getRollingWeekBuckets = (anchor: Date, count = 8) => {
  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const end = new Date(anchor);
    end.setDate(end.getDate() - offset * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    return {
      key: `${start.toISOString().slice(0, 10)}:${end.toISOString().slice(0, 10)}`,
      label: start.toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
      detailLabel: `${start.toLocaleDateString("en-PH", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}`,
      start,
      end,
      income: 0,
      expense: 0,
    };
  });
};

