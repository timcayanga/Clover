import { Prisma } from '@prisma/client';

export function portfolioConfidence(value: number | null | undefined) {
  if (!Number.isFinite(value)) return 0;
  const n = value as number;
  return Math.round(Math.max(0, Math.min(100, n > 0 && n <= 1 ? n * 100 : n)));
}

export function isHoldingsOnlyPortfolio(params: {
  mode: string; schemaValidated: boolean; localRows: number; backupRows: number;
  holdings: Array<{ asset_name: string; current_value: number | null; market_value: number | null }>;
}) {
  return ['portfolio', 'account_detail'].includes(params.mode) && params.schemaValidated &&
    params.localRows === 0 && params.backupRows === 0 && params.holdings.length > 0 &&
    params.holdings.every(h => h.asset_name.trim() &&
      Number.isFinite(h.current_value ?? h.market_value) && (h.current_value ?? h.market_value)! >= 0);
}

const identity = (value: string | null | undefined) => value?.trim().replace(/\s+/g, ' ').toLowerCase() ?? '';

/** Called inside one transaction. No existing Account or Transaction is updated.
 * The source document and original snapshot remain available for traceability.
 */
export async function finalizePortfolioImport(
  tx: Prisma.TransactionClient,
  params: { importFileId: string; workspaceId: string; accountLimit: number | null },
) {
  const { importFileId, workspaceId, accountLimit } = params;
  const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  // Serialize this user's portfolio imports across Profiles, including quota checks.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${workspace.userId} FOR UPDATE`;
  const file = await tx.importFile.findFirst({ where: { id: importFileId, workspaceId } });
  if (!file || file.status === 'deleted') throw new Error('This import is no longer available.');
  const doc = await tx.documentImport.findUnique({ where: { importFileId }, include: { investmentHoldings: true, investmentSnapshot: true } });
  if (!doc || doc.workspaceId !== workspaceId || !['portfolio', 'account_detail'].includes(doc.documentFamily)) return null;
  if (await tx.parsedTransaction.count({ where: { importFileId } })) return null;
  if (!doc.investmentHoldings.length) throw new Error('No portfolio holdings were readable. Upload a clearer portfolio screenshot or add the investment manually.');
  const holdings = doc.investmentHoldings;
  // A completed import is also the retry checkpoint; never recreate deleted assets.
  if (file.status === 'done') return { accountId: file.accountId, holdings: holdings.length };
  const institution = doc.institution?.trim();
  if (!institution || /^(unknown|unknown institution)$/i.test(institution)) {
    throw new Error('The portfolio provider could not be identified. Upload a screenshot that includes the institution name.');
  }
  const accounts = await tx.account.findMany({ where: { workspaceId } });
  const tombstones = await tx.accountTombstone.findMany({ where: { workspaceId, accountType: 'investment' } });
  let accountCount = await tx.account.count({ where: { workspace: { userId: workspace.userId }, type: { not: 'cash' } } });
  const seen = new Set<string>();
  let firstAccountId: string | null = null;
  for (const holding of holdings) {
    const value = holding.currentValue ?? holding.marketValue;
    const raw = holding.rawPayload && typeof holding.rawPayload === 'object' && !Array.isArray(holding.rawPayload)
      ? holding.rawPayload as Record<string, unknown> : {};
    if (!holding.assetName.trim() || value === null || !Number.isFinite(Number(value)) || Number(value) < 0 ||
        !/^[A-Z]{3}$/.test(holding.currency) || raw.currencyEvidence === null) {
      throw new Error('A portfolio holding needs a clear name, currency, and current value. Upload a clearer screenshot; no investments were added.');
    }
    const key = `${identity(holding.assetName)}:${holding.currency}`;
    if (seen.has(key)) throw new Error('The portfolio contains ambiguous duplicate holdings. Review the source before importing.');
    seen.add(key);
    const matches = accounts.filter(a => a.type === 'investment' && a.currency === holding.currency &&
      identity(a.institution) === identity(institution) && identity(a.name) === identity(holding.assetName));
    if (matches.length > 1) throw new Error('Multiple investments match this holding. Resolve the duplicate accounts before importing.');
    let account = holding.accountId ? accounts.find(a => a.id === holding.accountId && a.type === 'investment' && a.currency === holding.currency) : matches[0];
    if (holding.accountId && !account) throw new Error('The portfolio account link needs review. No records were changed.');
    if (!account) {
      if (['confirmed', 'edited', 'rejected', 'duplicate_skipped'].includes(holding.status ?? '')) {
        throw new Error('This portfolio contains previously reviewed holdings. Resolve their account links before retrying.');
      }
      if (tombstones.some(t => identity(t.name) === identity(holding.assetName) && identity(t.institution) === identity(institution) && t.currency === holding.currency)) {
        throw new Error('This investment was previously deleted. Add it manually before retrying this import.');
      }
      if (accountLimit !== null && accountCount >= accountLimit) throw new Error('Your account allowance cannot fit this portfolio. Free up accounts or upgrade, then retry.');
      account = await tx.account.create({ data: {
        workspaceId, name: holding.assetName.trim(), institution, type: 'investment', source: 'upload',
        currency: holding.currency, balance: value, investmentQuantity: holding.quantity,
        investmentSymbol: holding.assetSymbol, investmentSubtype: holding.assetType,
        investmentCostBasis: holding.costBasis,
        importIdentityName: holding.assetName.trim(), importIdentityInstitution: institution,
      } });
      accounts.push(account); accountCount += 1;
    }
    firstAccountId ??= account.id;
    if (['confirmed', 'edited', 'rejected', 'duplicate_skipped'].includes(holding.status ?? '')) continue;
    const snapshotId = `portfolio_${holding.id}`;
    await tx.investmentSnapshot.upsert({ where: { id: snapshotId }, update: {}, create: {
      id: snapshotId, workspaceId, accountId: account.id,
      snapshotDate: doc.investmentSnapshot?.snapshotDate ?? null,
      portfolioName: holding.assetName, currency: holding.currency, totalValue: value,
      costBasis: holding.costBasis, confidence: portfolioConfidence(holding.confidence),
      rawPayload: { sourceDocumentImportId: doc.id, sourceSnapshotId: doc.investmentSnapshot?.id ?? null, sourceHoldingId: holding.id, reviewRequired: true },
    } });
    await tx.investmentHolding.update({ where: { id: holding.id }, data: {
      investmentSnapshotId: snapshotId, accountId: account.id, status: 'pending_review',
      confidence: portfolioConfidence(holding.confidence),
      rawPayload: { ...raw, reviewRequired: true, reviewReasons: ['Verify the asset, currency, quantity and valuation against the source portfolio.'] } as Prisma.InputJsonValue,
    } });
  }
  await tx.importFile.update({ where: { id: importFileId }, data: {
    accountId: firstAccountId, status: 'done', processingPhase: 'complete',
    processingMessage: `${holdings.length} portfolio holdings are available in Investments. Review their details against your source.`,
    confirmedTransactionsCount: 0,
  } });
  await tx.auditLog.create({ data: { workspaceId, actorUserId: 'system', action: 'import.portfolio_materialized', entity: 'ImportFile', entityId: importFileId,
    metadata: { documentImportId: doc.id, holdingIds: holdings.map(h => h.id), accountId: firstAccountId, reviewRequired: true, existingAccountsPreserved: true, transactionsCreated: 0 } } });
  return { accountId: firstAccountId, holdings: holdings.length };
}
