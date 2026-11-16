export function parseSnapshotCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (c === '"') {
      if (quoted && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && csv[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Incomplete export. Please download it again.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function snapshotHtml(csv: string, title: string, profile: string) {
  const [columns = [], ...rows] = parseSnapshotCsv(csv);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:landscape;margin:28px}body{font-family:Arial,sans-serif;color:#18343e;font-size:10px}h1{color:#007f90;font-size:22px}p{font-size:12px}table{border-collapse:collapse;table-layout:fixed;width:100%}th,td{border-bottom:1px solid #dce9eb;padding:7px 5px;text-align:left;overflow-wrap:anywhere;white-space:pre-wrap;vertical-align:top}th{background:#e7f7f6}thead{display:table-header-group}tr{break-inside:avoid}</style></head><body><h1>Clover · ${escapeHtml(title)}</h1><p>${escapeHtml(profile)} · ${rows.length} records · ${escapeHtml(new Date().toISOString())}</p><table><thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>${rows.length ? "" : "<p>No records to export.</p>"}</body></html>`;
}
