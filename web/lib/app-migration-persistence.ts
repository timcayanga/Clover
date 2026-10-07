import type { Prisma } from "@prisma/client";
import { readAppMigration } from "@/lib/app-migration-import";
import { normalizeTransactionTagKey } from "@/lib/transaction-tags";

// Called inside the same confirmation transaction and only for newly inserted
// rows. Reimports cannot replace tags on an existing confirmed transaction.
export const persistMigrationTags = async (
  tx: Pick<Prisma.TransactionClient, "tag" | "transactionTag">,
  workspaceId: string,
  transactions: Array<{ id: string; rawPayload: unknown }>
) => {
  const tagged = transactions.map(row => ({ ...row, tags: readAppMigration(row.rawPayload)?.tags ?? [] })).filter(row => row.tags.length);
  if (!tagged.length) return;
  const names = new Map<string, string>();
  tagged.forEach(row => row.tags.forEach(name => names.set(normalizeTransactionTagKey(name), name)));
  await tx.tag.createMany({ data: [...names].map(([normalizedName, name]) => ({ workspaceId, normalizedName, name })), skipDuplicates: true });
  const tags = await tx.tag.findMany({ where: { workspaceId, normalizedName: { in: [...names.keys()] } }, select: { id: true, normalizedName: true } });
  const ids = new Map(tags.map(tag => [tag.normalizedName, tag.id]));
  const links = tagged.flatMap(row => row.tags.map(name => {
    const tagId = ids.get(normalizeTransactionTagKey(name));
    if (!tagId) throw new Error("An imported tag could not be saved. Please retry the import.");
    return { transactionId: row.id, tagId };
  }));
  for (let i = 0; i < links.length; i += 1000) await tx.transactionTag.createMany({ data: links.slice(i, i + 1000), skipDuplicates: true });
};
