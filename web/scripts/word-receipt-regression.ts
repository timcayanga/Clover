import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { decodeWordGrabReceiptBytes } from '../lib/word-receipt-import.server';
import { parseGrabEmailReceipt, hasVerifiedGrabReceiptRows } from '../lib/grab-email-receipt';
import { isSourceReviewRequiredError } from '../lib/import-source-review';

async function main() {
  const bytes = readFileSync('scripts/fixtures/reviewed-parser-corpus/grab-native-word.docx');
  const text = await decodeWordGrabReceiptBytes(bytes);
  const parsed = parseGrabEmailReceipt(text)!;
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].amount, '250.00');
  assert.equal(hasVerifiedGrabReceiptRows(text, parsed.rows), true);
  const altered = structuredClone(parsed.rows); (altered[0].rawPayload!.wordParts as Array<{sha256:string}>)[0].sha256 = '0'.repeat(64);
  assert.equal(hasVerifiedGrabReceiptRows(text, altered), false);
  async function modified(change: (zip: JSZip, xml: string) => void) {
    const zip = await JSZip.loadAsync(bytes);
    change(zip, await zip.file('word/document.xml')!.async('string'));
    await assert.rejects(decodeWordGrabReceiptBytes(await zip.generateAsync({type:'uint8array'})), isSourceReviewRequiredError);
  }
  await modified((zip, xml) => zip.file('word/document.xml', xml.replaceAll('65.25', '65.26')));
  await modified((zip, xml) => zip.file('word/document.xml', '<!DOCTYPE x [<!ENTITY x "money">]>' + xml));
  await modified((zip, xml) => zip.file('word/document.xml', xml.replaceAll('w:txbxContent', 'w:del')));
  await modified(zip => zip.file('word/embeddings/oleObject1.bin', 'ignored payload'));
  await modified(zip => zip.file('word/document.xml', '<w:document>' + 'x'.repeat(4*1024*1024) + '</w:document>'));
  await modified(zip => zip.remove('[Content_Types].xml'));
  for(const tag of ['vanish','footnoteReference','endnoteReference','fldSimple','instrText']) await modified((zip, xml) => zip.file('word/document.xml',xml.replace('<w:body>','<w:body><w:'+tag+'/>')));
  await modified((zip, xml) => zip.file('word/document.xml', xml.replaceAll('Hope you enjoyed your ride!', 'Unrecognized document')));
  await assert.rejects(decodeWordGrabReceiptBytes(Buffer.from('not a Word file')), isSourceReviewRequiredError);
  console.log('Word receipt: complete native drawing, mutually exclusive copies, exact reconciled cash evidence, tamper, malformed/oversize/active/revised/unsupported document refusals passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
