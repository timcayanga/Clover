import JSZip from 'jszip';
import { DOMParser, type Node, type Element } from '@xmldom/xmldom';
import { createHash } from 'node:crypto';
import { SourceReviewRequiredError } from './import-source-review';
import { parseGrabEmailReceipt } from './grab-email-receipt';

const MAX_BYTES = 4 * 1024 * 1024;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
function fail(reason: string): never { throw new SourceReviewRequiredError(`Word receipt requires source review: ${reason}`); }

/** Read one complete native Grab receipt; never treat arbitrary Word prose as a ledger. */
export async function decodeWordGrabReceiptBytes(bytes: Uint8Array): Promise<string> {
  if (!bytes.length || bytes.length > MAX_BYTES) fail('document exceeds the bounded reader');
  let zip: JSZip;
  try { zip = await JSZip.loadAsync(bytes); } catch { return fail('invalid DOCX container'); }
  const names = Object.keys(zip.files);
  if (names.length > 512 || names.some(name => /(?:vbaProject|embeddings\/|activeX\/|altChunk)/i.test(name))) fail('unsupported active or embedded content');
  let inflated = 0;
  async function read(name: string) {
    const entry = zip.file(name);
    if (!entry) return fail(`missing ${name}`);
    const chunks: Buffer[] = [];
    const stream = entry.nodeStream('nodebuffer');
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        inflated += chunk.length;
        if (inflated > MAX_BYTES) {
          stream.pause();
          reject(new SourceReviewRequiredError('Word receipt requires source review: expanded XML exceeds the bounded reader'));
          if ('destroy' in stream && typeof stream.destroy === 'function') stream.destroy();
        } else chunks.push(chunk);
      });
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    return Buffer.concat(chunks);
  }
  function xml(bytes: Buffer) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) fail('DTD and entities are unsupported');
    try { return new DOMParser({ onError: () => fail('malformed XML') }).parseFromString(text, 'application/xml'); }
    catch { return fail('malformed XML'); }
  }
  const contentTypes = xml(await read('[Content_Types].xml'));
  const types = Array.from(contentTypes.getElementsByTagName('Override'));
  if (!types.some(node => node.getAttribute('PartName') === '/word/document.xml' && node.getAttribute('ContentType') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')) fail('not a standard DOCX document');
  if (types.some(node => /wordprocessingml\.(?:header|footer)\+xml$/.test(node.getAttribute('ContentType') ?? '') && !/^\/word\/(?:header|footer)\d+\.xml$/.test(node.getAttribute('PartName') ?? ''))) fail('unsupported native header or footer part');
  const parts = ['word/document.xml', ...names.filter(name => /^word\/(?:header|footer)\d+\.xml$/.test(name)).sort()];
  const evidence: Array<{ name: string; sha256: string; text: string }> = [];
  for (const name of parts) {
    const source = await read(name);
    const doc = xml(source);
    let nodes = 0;
    const walk = (node: Node, depth = 0): string => {
      if (++nodes > 100000 || depth > 128) fail('XML nesting or node limit exceeded');
      if (node.nodeType !== 1 && node.nodeType !== 9) return '';
      const element = node as Element;
      const local = element.localName ?? '';
      if (element.namespaceURI === W && /^(?:ins|del|altChunk|object|sdt|vanish|footnoteReference|endnoteReference)$/.test(local)) fail('revisions, dynamic fields or embedded content need review');
      if (name === 'word/document.xml' && element.namespaceURI === W && /^(?:fldSimple|instrText)$/.test(local)) fail('dynamic body fields need review');
      const children = Array.from(node.childNodes);
      // Word stores the same drawing twice for compatibility. Select one
      // supported Word drawing representation; never concatenate both copies.
      if (element.namespaceURI === MC && local === 'AlternateContent') {
        const choices = children.filter(child => (child as Element).namespaceURI === MC && (child as Element).localName === 'Choice') as Element[];
        const choice = choices.find(child => (child.getAttribute('Requires') ?? '').split(/\s+/).every(prefix => child.lookupNamespaceURI(prefix) === 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape'));
        const selected = choice ?? children.find(child => (child as Element).namespaceURI === MC && (child as Element).localName === 'Fallback');
        if (!selected) fail('unsupported compatibility drawing');
        return walk(selected, depth + 1);
      }
      if ((element.namespaceURI === W || element.namespaceURI === A) && local === 't') return element.textContent ?? '';
      if (element.namespaceURI === W && /^(?:br|cr|tab)$/.test(local)) return '\n';
      return children.map(child => walk(child, depth + 1)).join('') + (element.namespaceURI === W && /^(?:p|tc)$/.test(local) ? '\n' : '');
    };
    evidence.push({ name, sha256: createHash('sha256').update(source).digest('hex'), text: walk(doc).replace(/\u00a0|\u202f/g, ' ') });
  }
  const text = 'GRAB_RECEIPT_NATIVE ' + JSON.stringify({ sourceFormat: 'docx', wordParts: evidence });
  // Enforce the full receipt contract before returning any text to fallbacks.
  const result = parseGrabEmailReceipt(text);
  if (!result || result.rows.length !== 1 || result.rows[0].rawPayload?.kind !== 'cash_transaction') fail('one complete supported receipt is required');
  return text;
}
