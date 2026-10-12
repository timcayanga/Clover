import type {
  ParsedImportRow,
  DetectedStatementMetadata,
} from "@/lib/import-parser";

type Item = { str?: string; transform?: number[]; width?: number };
type Proof = {
  inputDate: string;
  inputTime: string;
  transferDate: string;
  transferTime: string;
  sourceAccount: string;
  owner: string;
  recipient: string;
  amount: string;
  fee: string;
  fx: string;
  status: string;
  reference: string;
  recipientOwner?: string;
};
const heading = (text: string) =>
  /Transfer Dana/i.test(text) &&
  /Transaksi berhasil diotorisasi/i.test(text) &&
  (/BCA\.\s*Hak cipta/i.test(text) || /https:\/\/vpn\.klikbca\.com\//i.test(text));
const money = (value: string) =>
  /^Rp\s*(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}$/.test(value)
    ? Number(value.replace(/^Rp\s*/, "").replace(/,/g, ""))
    : null;
const date = (value: string) => {
  const m = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const result = new Date(Date.UTC(+m[3]!, +m[2]! - 1, +m[1]!));
  return result.getUTCFullYear() === +m[3]! &&
    result.getUTCMonth() === +m[2]! - 1 &&
    result.getUTCDate() === +m[1]!
    ? result.toISOString().slice(0, 10)
    : null;
};
const time = (value: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value);

/** Only this single-row native KlikBCA table. Column roles survive wrapped text. */
export function buildBcaTransferPdfRows(
  items: Item[],
  physicalPages = 1,
): string[] {
  if (physicalPages !== 1) return [];
  const cells = items
    .filter((i) => i.str?.trim() && i.transform?.length === 6)
    .map((i) => ({
      text: i.str!.trim(),
      x: i.transform![4]!,
      y: i.transform![5]!,
      height: Math.abs(i.transform![3]!),
    }));
  if (!heading(cells.map((c) => c.text).join("\n"))) return [];
  const find = (label: string) => cells.find((c) => c.text === label);
  const source = find("Dari Rekening") ?? find("Dari"),
    kind = find("Jenis"),
    transfer = find("Transfer"),
    destination = find("Rekening /") ?? cells.find(c => /^Ke Rekening(?:\s*\/)?$/.test(c.text)),
    amount = find("Jumlah"),
    fee = find("Biaya"),
    fx = find("Kurs");
  const status = cells.find((c) => /^Status\s+Alasan\s+No\.\s+Referensi$/.test(c.text)) ?? find("Status");
  const reasonHeader = find("Alasan"), referenceHeader = find("No. Referensi") ?? find("No.");
  if (status?.text === "Status" && (!reasonHeader || !referenceHeader || reasonHeader.x <= status.x || referenceHeader.x <= reasonHeader.x)) return [];
  if (source?.text === "Dari" && !cells.some(c => c.text === "Rekening" && Math.abs(c.x-source.x)<1 && c.y<source.y && c.y>=source.y-2*source.height)) return [];
  if (referenceHeader?.text === "No." && !cells.some(c => c.text === "Referensi" && Math.abs(c.x-referenceHeader.x)<1 && c.y<referenceHeader.y && c.y>=referenceHeader.y-2*referenceHeader.height)) return [];
  const input = cells.find((c) => c.text === "Tanggal" && kind && c.x < kind.x);
  if (
    !source ||
    !kind ||
    !transfer ||
    !destination ||
    !amount ||
    !fee ||
    !fx ||
    !status ||
    !input
  )
    return [];
  const transferDateHeader = cells.find(
    (c) => c.text === "Tanggal" && c.x > kind.x && c.x < source.x,
  );
  if (!transferDateHeader) return [];
  const boundaries = [
    input.x,
    kind.x,
    transferDateHeader.x,
    source.x,
    destination.x,
    amount.x,
    fee.x,
    fx.x,
    status.x,
  ];
  if (boundaries.some((x, i) => i > 0 && x <= boundaries[i - 1]!)) return [];
  const starts = cells.filter(
    (c) =>
      /^\d{2}\/\d{2}\/\d{4}$/.test(c.text) &&
      c.x >= input.x - 1 &&
      c.x < kind.x &&
      c.y < source.y,
  );
  if (starts.length !== 1) return [];
  const start = starts[0]!,
    band = cells.filter(
      (c) =>
        c.y <= start.y + 2 * start.height &&
        c.y >= start.y - 3.5 * start.height,
    );
  const column = (left: number, right: number) =>
    band
      .filter((c) => c.x >= left - 0.5 && c.x < right - 0.5)
      .sort((a, b) => b.y - a.y || a.x - b.x)
      .map((c) => c.text)
      .join(" ")
      .trim();
  const inputParts = column(input.x, kind.x).split(/\s+/),
    transferParts = column(transferDateHeader.x, source.x).split(/\s+/);
  const from = column(source.x, destination.x).match(
    /^(\d{3})-\s*(\d{7})\s*\/\s*(.+?)\s*\(Rp\)$/,
  );
  const result = column(status.x, Infinity).match(
    /^(Berhasil)\s+-\s+(\d{10,25})$/,
  );
  if (
    inputParts.length !== 2 ||
    transferParts.length !== 2 ||
    !from ||
    !result ||
    !/^Rekening (?:Bank Lain|BCA)$/.test(column(kind.x, transferDateHeader.x))
  )
    return [];
  const recipientColumn = column(destination.x, amount.x);
  const sameBank = column(kind.x, transferDateHeader.x) === "Rekening BCA";
  const recipient = sameBank ? recipientColumn.match(/^(\d{3})-\s*(\d{7})\s*\/\s*(.+?)\s*\(Rp\)$/) : null;
  if (sameBank && !recipient) return [];
  const proof: Proof = {
    inputDate: inputParts[0]!,
    inputTime: inputParts[1]!,
    transferDate: transferParts[0]!,
    transferTime: transferParts[1]!,
    sourceAccount: from[1] + "-" + from[2],
    owner: from[3]!,
    recipient: recipient ? recipient[1] + "-" + recipient[2] : recipientColumn,
    ...(recipient ? {recipientOwner: recipient[3]} : {}),
    amount: column(amount.x, fee.x),
    fee: column(fee.x, fx.x),
    fx: column(fx.x, status.x),
    status: result[1]!,
    reference: result[2]!,
  };
  return valid(proof) ? ["BCA_TRANSFER " + JSON.stringify(proof)] : [];
}
function valid(p: Proof) {
  if (
    !p ||
    [
      "inputDate",
      "inputTime",
      "transferDate",
      "transferTime",
      "sourceAccount",
      "owner",
      "recipient",
      "amount",
      "fee",
      "fx",
      "status",
      "reference",
    ].some(
      (k) => typeof (p as unknown as Record<string, unknown>)[k] !== "string",
    )
  )
    return false;
  return (
    money(p.amount) !== null &&
    money(p.fee) !== null &&
    Number.isSafeInteger(Math.round(money(p.amount)! * 100)) &&
    Number.isSafeInteger(Math.round(money(p.fee)! * 100)) &&
    date(p.inputDate) &&
    date(p.transferDate) &&
    time(p.inputTime) &&
    time(p.transferTime) &&
    p.inputDate === p.transferDate &&
    p.inputTime === p.transferTime &&
    /^\d{3}-\d{7}$/.test(p.sourceAccount) &&
    /[A-Za-z]/.test(p.owner) &&
    (/^[0-9]{10,20}$/.test(p.recipient) || (/^\d{3}-\d{7}$/.test(p.recipient) && typeof p.recipientOwner === "string" && /[A-Za-z]/.test(p.recipientOwner))) &&
    money(p.amount)! > 0 &&
    money(p.fee)! >= 0 &&
    p.fx === "1.00" &&
    p.status === "Berhasil" &&
    /^\d{10,25}$/.test(p.reference)
  );
}
export function parseBcaTransferProof(
  text: string,
): { rows: ParsedImportRow[]; metadata: DetectedStatementMetadata } | null {
  const notification = parseBcaTransferNotification(text);
  if (notification) return notification;
  if (!heading(text)) return null;
  const metadata: DetectedStatementMetadata = {
    institution: "BCA",
    accountNumber: null,
    accountName: "BCA",
    accountType: "bank",
    currency: "IDR",
    openingBalance: null,
    endingBalance: null,
    startDate: null,
    endDate: null,
    confidence: 0,
    identityEvidence: ["bca-native-transfer-columns"],
  };
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("BCA_TRANSFER "));
  const physical = [...text.matchAll(/^BCA_NATIVE_PAGES (\d+)$/gm)];
  const pages = [...text.matchAll(/Halaman\s+(\d+)\s+dari\s+(\d+)/gi)];
  if (
    physical.length !== 1 ||
    physical[0]![1] !== "1" ||
    lines.length !== 1 ||
    !((pages.length === 1 && pages[0]![1] === "1" && pages[0]![2] === "1") || (!pages.length && /https:\/\/vpn\.klikbca\.com\//i.test(text) && /(?:^|\s)1\/1[ \t]*$/m.test(text)))
  )
    return { rows: [], metadata };
  let p: Proof;
  try {
    p = JSON.parse(lines[0]!.slice("BCA_TRANSFER ".length));
  } catch {
    return { rows: [], metadata };
  }
  if (!p || Object.values(p).some((v) => typeof v !== "string") || !valid(p))
    return { rows: [], metadata };
  const d = date(p.transferDate)!;
  metadata.accountNumber = p.sourceAccount;
  metadata.accountName = "BCA " + p.sourceAccount.slice(-4);
  metadata.startDate = d;
  metadata.endDate = d;
  metadata.confidence = 95;
  const components = [
    {
      component: "principal",
      amount: money(p.amount)!,
      name: "Transfer to " + p.recipient,
      category: "Transfers",
    },
    {
      component: "fee",
      amount: money(p.fee)!,
      name: "BCA Transfer Fee",
      category: "Financial",
    },
  ].filter((c) => c.amount > 0);
  return {
    metadata,
    rows: components.map((c) => ({
      date: d,
      amount: c.amount.toFixed(2),
      currency: "IDR",
      type: "expense",
      merchantRaw: c.name,
      merchantClean: c.name,
      description: c.name,
      categoryName: c.category,
      institution: "BCA",
      accountNumber: p.sourceAccount,
      accountName: metadata.accountName!,
      confidence: 95,
      parserConfidence: 100,
      categoryConfidence: 95,
      rawPayload: {
        source: "bca_transfer_proof",
        kind: "bank_transfer_component",
        component: c.component,
        direction: "outgoing",
        reference: p.reference,
        sourceAccount: p.sourceAccount,
        sourceAccountOwner: p.owner,
        recipientIdentifier: p.recipient,
        ...(p.recipientOwner ? { recipientOwner: p.recipientOwner } : {}),
        inputDate: p.inputDate,
        inputTime: p.inputTime,
        transferDate: p.transferDate,
        transferTime: p.transferTime,
        sourceCurrency: "IDR",
        fxRate: p.fx,
        principal: money(p.amount),
        fee: money(p.fee),
        totalDebit: money(p.amount)! + money(p.fee)!,
        accountCurrency: "IDR",
        accountType: "bank",
        sourceText: text,
        parserEvidence: {
          version: "bca-native-columns-v1",
          datePolicy: "calendar date; printed timezone absent",
          reason:
            "Single successful transfer, distinct source/recipient columns, principal and fee in IDR; no source balance anchor",
        },
      },
    })),
  };
}
export function hasVerifiedBcaTransferRows(
  text: string,
  rows: ParsedImportRow[],
) {
  const expected = parseBcaTransferProof(text)?.rows;
  if (!expected?.length || rows.length !== expected.length) return false;
  const project = (r: ParsedImportRow) => [
    r.date,
    r.amount,
    r.currency,
    r.type,
    r.accountNumber,
    r.rawPayload?.source,
    r.rawPayload?.component,
    r.rawPayload?.reference,
  ];
  return (
    JSON.stringify(rows.map(project)) === JSON.stringify(expected.map(project))
  );
}

/** Mirrored Indonesian/English notifications describe one event, never two. */
function parseBcaTransferNotification(text: string): { rows: ParsedImportRow[]; metadata: DetectedStatementMetadata } | null {
  if (!/KlikBCA Bisnis/i.test(text) || !/Jenis Transaksi\s*:\s*TRANSFER DANA/i.test(text)) return null;
  const metadata: DetectedStatementMetadata = { institution: 'BCA', accountNumber: null, accountName: 'BCA', accountType: 'bank', currency: 'IDR', openingBalance: null, endingBalance: null, startDate: null, endDate: null, confidence: 0, identityEvidence: ['bca-native-bilingual-notification'] };
  const unsafe = { rows: [] as ParsedImportRow[], metadata };
  const physical = [...text.matchAll(/^BCA_NATIVE_PAGES (\d+)$/gm)];
  if (physical.length !== 1 || physical[0][1] !== '2' || !/klikbcabisnis@klikbca\.com/i.test(text) || !/PT\.\s*BANK CENTRAL ASIA TBK/i.test(text) || !/Notes:\s*Charges VAT Inclusive/i.test(text)) return unsafe;
  const one = (label: string) => { const matches=[...text.matchAll(new RegExp('^\\s*'+label+'\\s*:\\s*([^\\n]+)$','gmi'))]; return matches.length===1 ? matches[0][1].trim() : null; };
  const fields = [ ['Tanggal','Date'], ['Jam','Time'], ['Dari Rekening','From Account'], ['Ke Rekening','To Account'], ['Nominal','Amount'], ['No Referensi','Reference No'] ];
  const values=fields.map(([a,b])=>{const x=one(a),y=one(b);return x && y && x===y ? x : null;});
  if(values.some(v=>v===null)) return unsafe;
  const statuses=[...text.matchAll(/^\s*Status\s*:\s*(\S+)\s*$/gmi)].map(m=>m[1]);
  if(JSON.stringify(statuses)!==JSON.stringify(['Berhasil','Success']) || one('Transaction Type')!=='FUND TRANSFER' || one('Jenis Transfer')!=='Sekarang' || one('Transfer Type')!=='Immediate') return unsafe;
  const [stamp, clock, source, recipient, amount, reference]=values as string[];
  const d=date(stamp), n=money(amount);
  if(!d || !time(clock) || !/^\d{3}-\d{7}$/.test(source) || !/^\d{3}-\d{7}$/.test(recipient) || !/^\d{10,25}$/.test(reference) || n===null || n<=0 || !Number.isSafeInteger(Math.round(n*100))) return unsafe;
  metadata.accountNumber=source;metadata.accountName='BCA '+source.slice(-4);metadata.startDate=d;metadata.endDate=d;metadata.confidence=95;
  const name='Transfer to '+recipient;
  return {metadata,rows:[{date:d,amount:n.toFixed(2),currency:'IDR',type:'expense',merchantRaw:name,merchantClean:name,description:name,categoryName:'Transfers',institution:'BCA',accountNumber:source,accountName:metadata.accountName!,confidence:95,parserConfidence:100,categoryConfidence:95,rawPayload:{source:'bca_transfer_proof',kind:'bank_transfer_component',component:'principal',direction:'outgoing',reference,sourceAccount:source,recipientIdentifier:recipient,transferDate:stamp,transferTime:clock,sourceCurrency:'IDR',principal:n,fee:null,totalDebit:null,accountCurrency:'IDR',accountType:'bank',sourceText:text,parserEvidence:{version:'bca-bilingual-notification-v1',physicalPages:2,mirroredLanguages:['id','en'],feePolicy:'not printed; unknown',datePolicy:'calendar date; printed timezone absent',reason:'Complete matching bilingual successful transfer; no balance anchor'}}}]};
}
