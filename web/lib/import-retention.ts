import { prisma } from "@/lib/prisma";
import { deleteImportObject } from "@/lib/s3-delete";

export const purgeExpiredImportFiles = async (params: { limit?: number } = {}) => {
  const files = await prisma.importFile.findMany({
    where: {
      rawExpiresAt: { lte: new Date() },
      rawPurgedAt: null,
      status: { not: "deleted" },
    },
    select: { id: true, storageKey: true },
    orderBy: { rawExpiresAt: "asc" },
    take: Math.max(1, Math.min(params.limit ?? 50, 200)),
  });
  let purged = 0;
  for (const file of files) {
    try {
      if (file.storageKey) await deleteImportObject(file.storageKey);
      await prisma.importFile.update({ where: { id: file.id }, data: { rawPurgedAt: new Date() } });
      purged += 1;
    } catch (error) {
      console.warn("Unable to purge expired raw import file", { importFileId: file.id, error });
    }
  }
  return { candidates: files.length, purged };
};
