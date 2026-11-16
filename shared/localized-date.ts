export function displayDate(iso: string, format = "MM/DD/YYYY") {
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(iso)) return iso;
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return format.startsWith("DD")
    ? `${d}/${m}/${y}`
    : format.startsWith("YYYY")
      ? `${y}-${m}-${d}`
      : `${m}/${d}/${y}`;
}
export function parseDisplayDate(value: string, format = "MM/DD/YYYY") {
  if (!value.trim()) return null;
  let y: string, m: string, d: string;
  const parts = value.trim().split(/[-/]/);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) [y, m, d] = parts;
  else {
    const v = /^\d{8}$/.test(value)
      ? format.startsWith("YYYY")
        ? [value.slice(0, 4), value.slice(4, 6), value.slice(6)]
        : [value.slice(0, 2), value.slice(2, 4), value.slice(4)]
      : parts;
    if (v.length !== 3) throw new Error(`Enter a date as ${format}.`);
    if (format.startsWith("DD")) [d, m, y] = v;
    else if (format.startsWith("YYYY")) [y, m, d] = v;
    else [m, d, y] = v;
  }
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const parsed = new Date(iso + "T12:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(iso) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== iso
  )
    throw new Error("Choose a valid date.");
  return parsed.toISOString();
}
