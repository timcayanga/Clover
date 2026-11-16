import { commitAdviserEntries } from "../lib/adviser-entry-save";
import { entryTransaction } from "../lib/adviser-entry-types";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import {
  storeAdviserAttachment,
  loadAdviserAttachments,
} from "../lib/adviser-attachments.server";
import { downloadImportObject } from "../lib/import-storage.server";
import { deleteImportObject } from "../lib/s3-delete";
async function main() {
  assert.equal(
    process.env.DATABASE_URL,
    "postgresql://clover_test@127.0.0.1:56543/clover_entries",
  );
  const uid = randomUUID();
  const user = await prisma.user.create({
    data: { clerkUserId: uid, email: `${uid}@example.invalid` },
  });
  const ws = await prisma.workspace.create({
    data: { name: "Attachment regression", userId: user.id },
  });
  const keys: string[] = [];
  try {
    const text = "Receipt: Coffee PHP 180\n2026-09-08";
    const file = new File([text], "receipt.txt", { type: "text/plain" });
    const attachment = await storeAdviserAttachment(file, ws.id, user.id);
    const record = await prisma.auditLog.findUniqueOrThrow({
      where: { id: attachment.id },
    });
    const meta = record.metadata as { storageKey: string };
    keys.push(meta.storageKey);
    assert.equal(
      new TextDecoder().decode(await downloadImportObject(meta.storageKey)),
      text,
    );
    assert.deepEqual(
      await loadAdviserAttachments([attachment.id], ws.id, user.id),
      [{ id: attachment.id, name: "receipt.txt", text }],
    );
    await assert.rejects(
      loadAdviserAttachments([attachment.id], "other", user.id),
      /unavailable/,
    );
    await assert.rejects(
      loadAdviserAttachments([attachment.id], ws.id, "other"),
      /unavailable/,
    );
    await assert.rejects(
      storeAdviserAttachment(file, ws.id, "other"),
      /unavailable/,
    );
    await assert.rejects(
      storeAdviserAttachment(
        new File(["x".repeat(24001)], "long.txt"),
        ws.id,
        user.id,
      ),
      /too long/,
    );
    assert.equal(
      await prisma.transaction.count({ where: { workspaceId: ws.id } }),
      0,
    );
    assert.equal(
      await prisma.account.count({ where: { workspaceId: ws.id } }),
      0,
    );
    const account=await prisma.account.create({data:{workspaceId:ws.id,name:"Test cash",type:"cash",currency:"PHP"}});
    const draft={version:1 as const,id:randomUUID(),workspaceId:ws.id,sourceText:"Record the attached receipt",confidence:0,attachmentIds:[attachment.id],accounts:[],receipts:[],transactions:[{...entryTransaction("coffee"),merchant:"Coffee",amount:"180",accountId:account.id,date:"2026-09-08"}]};
    await commitAdviserEntries(prisma,draft,user.id);
    const payment=await prisma.transaction.findFirstOrThrow({where:{workspaceId:ws.id}});
    assert.deepEqual((payment.rawPayload as {adviserAttachmentIds:string[]}).adviserAttachmentIds,[attachment.id]);
    await assert.rejects(commitAdviserEntries(prisma,{...draft,id:randomUUID(),attachmentIds:["adviser_file_bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"]},user.id),/unavailable/);
    assert.equal(await prisma.transaction.count({where:{workspaceId:ws.id}}),1);
    console.log(
      "PASS actual attachment extraction/storage, original evidence, ownership isolation, text limit, zero writes before confirmation and confirmed source linkage",
    );
  } finally {
    for (const key of keys) await deleteImportObject(key);
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
