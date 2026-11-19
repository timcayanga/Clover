/** Synthetic byte-backed fixtures; never original-document accuracy evidence. */
import assert from 'node:assert/strict';
import { statementPdf } from './synthetic-statement-pdf';

export function syntheticPdfFixtureBytes(text: string) {
  // Native-page control records are produced by the reader from actual PDF
  // structure; printing them would duplicate provenance on the next read.
  const lines = text.split('\n').filter(line => !/^[A-Z][A-Z0-9_]*_NATIVE_PAGES \d+$/.test(line) ||
    (line.startsWith('MARIBANK_NATIVE_PAGES ') && /^MARIBANK_TXN /m.test(text)))
    .filter(line => !(line === 'MARIBANK_NATIVE_ROW_COUNT 0' && /NO RECENT TRANSACTION/.test(text)));
  const nativeProof = text.split('\n').find(line => /^(?:GCASH_BILLS_NATIVE|GRAB_RECEIPT_NATIVE) /.test(line));
  let pages: string[][];
  if (nativeProof) {
    const proof = JSON.parse(nativeProof.slice(nativeProof.indexOf(' ')+1)) as { physicalPages: number; pages: {page:number;text:string}[] };
    assert.ok(Array.isArray(proof.pages) && proof.pages.length === proof.physicalPages && proof.pages.length <= 64);
    assert.ok(proof.pages.every((page,index)=>page.page === index+1 && typeof page.text === 'string'));
    pages = proof.pages.map(page=>{
      const lines = page.text.split('\n');
      // Give synthetic food proofs the established separate summary column.
      // This adds a layout heading, never transaction values or expected rows.
      if (nativeProof.startsWith('GRAB_RECEIPT_NATIVE ') && /Hope\s*you\s*enjoyed\s+(?:your\s+)?food/i.test(page.text) &&
          /Pick up location:/i.test(page.text) && !/Receipt Summary/i.test(page.text)) lines.unshift('Receipt Summary');
      return lines;
    });
  } else {
    const pageCounts = [...text.matchAll(/^[A-Z][A-Z0-9_]*_NATIVE_PAGES (\d+)$/gm)].map(match => Number(match[1]));
    const printed = lines.flatMap((line,index)=>{
      const marker=/^\s*(?:page|halaman)\s+(\d+)\s+(?:of|dari|\/)\s+(\d+)\s*$/i.exec(line);
      return marker ? [{index,page:Number(marker[1]),total:Number(marker[2])}] : [];
    });
    const pageCount = pageCounts.length ? Math.max(...pageCounts) : printed.length ? Math.max(...printed.map(marker=>marker.total)) : 1;
    assert.ok(pageCount > 0 && pageCount <= 64, 'Bound synthetic physical pages');
    if (printed.length === pageCount && printed.every((marker,index)=>marker.page === index+1 && marker.total === pageCount)) {
      const startsAtHeader = printed[0].index < 3;
      const cuts = startsAtHeader ? printed.slice(1).map(marker=>marker.index) : printed.slice(0,-1).map(marker=>marker.index+1);
      pages = [0,...cuts].map((start,index)=>lines.slice(start,cuts[index] ?? lines.length));
    } else {
      const perPage = Math.max(1, Math.ceil(lines.length / pageCount));
      pages = Array.from({length:pageCount},(_,index)=>lines.slice(index*perPage,(index+1)*perPage));
    }
  }
  return statementPdf(pages[0], 0, pages.slice(1), {
    width: Math.max(612, ...pages.flatMap(page=>page.map(line => line.length * 7 + 100))),
    height: Math.max(792, ...pages.map(page=>page.length * 18 + 100)), unicode: true,
  });
}
