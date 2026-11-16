import { indonesianBankColumnKey, indonesianBankTableHeader } from "@/lib/indonesian-bank-table";
import { parseIndonesianDate } from "@/lib/indonesian-financial-text";

type PositionedText = { text: string; x: number; width: number };

/** Preserve empty cells only when PDF coordinates establish the printed columns.
 * Uncertain placement returns null for the ordinary extraction/fallback path.
 */
export function formatIndonesianBankPdfRows(rows: Array<{ items: PositionedText[] }>): Array<string | null> {
  let columns: Array<{ x: number; key: string }> | null = null;
  return rows.map(row => {
    const items = row.items.slice().sort((a, b) => a.x - b.x);
    const header = indonesianBankTableHeader(items.map(item => item.text).join("\t"));
    if (header && header.length === items.length && items.every((item, index) => index === 0 || item.x - items[index - 1]!.x > 24)) {
      columns = items.map(item => ({ x: item.x, key: indonesianBankColumnKey(item.text)! }));
      return header.join("\t");
    }
    if (!columns) return null;
    const text = items.map(item => item.text).join(" ");
    if (/^(?:nama bank|nama rekening|nomor rekening|no\.? (?:rekening|rek)|nomor kartu|jenis rekening|mata uang|kode mata uang|satuan|periode|bulan laporan|saldo awal|saldo akhir|total (?:mutasi|debet|debit|kredit)|jumlah mutasi|tanggal cetak|dicetak pada|halaman)\b/i.test(text)) return null;
    const cells = columns.map(() => [] as string[]);
    for (const item of items) {
      let column = -1;
      columns.forEach((anchor, index) => { if (item.x >= anchor.x - 12) column = index; });
      if (column < 0) return null;
      const next = columns[column + 1];
      // Do not move a right-aligned amount into the previous column or split a
      // text item that spans columns. The original text remains available.
      if (next && item.x + item.width > next.x - 12) return null;
      cells[column]!.push(item.text);
    }
    const values = cells.map(parts => parts.join(" "));
    const dateColumn = columns.findIndex(column => column.key === "date");
    const dateIndex = dateColumn >= 0 ? dateColumn : columns.findIndex(column => column.key === "posted_date");
    const descriptionIndex = columns.findIndex(column => column.key === "description");
    const date = values[dateIndex] ?? "";
    const descriptionOnly = values.every((value, index) => !value || index === descriptionIndex) && Boolean(values[descriptionIndex]);
    if (!descriptionOnly && !parseIndonesianDate(date) && !/^\d{1,2}[/.]\d{1,2}$/.test(date)) return null;
    // Pipes retain an empty first/last cell even when callers trim the page.
    if (values.some(value => value.includes("|"))) return null;
    return values.join("|");
  });
}
