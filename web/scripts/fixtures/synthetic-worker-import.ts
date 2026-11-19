/** Normalized-input worker contracts, not PDF end-to-end accuracy tests.
 * Retained original-byte tests must provide sourceBytes and keep their type. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { processImportFileText as worker } from '../../workers/import-processor';

export async function processSyntheticTextImport(...args: Parameters<typeof worker>) {
  const url = new URL(process.env.DATABASE_URL ?? 'http://invalid');
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(url.pathname, '/clover_migration_qa');
  const [id, options = {}] = args;
  const { prisma } = await import('../../lib/prisma');
  const { processImportFileText } = await import('../../workers/import-processor');
  const file = await prisma.importFile.findUniqueOrThrow({ where: { id }, select: { fileName: true, fileType: true, sourceFingerprint: true, confirmedAt: true } });
  if (file.fileType !== 'application/pdf' || options.sourceBytes) return processImportFileText(...args);
  assert.equal(typeof options.text, 'string', 'Normalized source fixtures require an explicit transcript');
  const bytes = new TextEncoder().encode(options.text as string);
  const fingerprint = createHash('sha256').update(bytes).digest('hex');
  assert.equal(file.confirmedAt, null, 'Never replace a confirmed fixture source');
  assert.ok(!file.sourceFingerprint || file.sourceFingerprint === fingerprint,
    'Original-byte fixtures must supply their retained bytes instead');
  await prisma.importFile.update({ where: { id }, data: {
    fileName: file.fileName.replace(/\.pdf$/i,'.txt'), fileType: 'text/plain', sourceFingerprint: fingerprint,
  } });
  return processImportFileText(id, { ...options, sourceBytes: bytes });
}
