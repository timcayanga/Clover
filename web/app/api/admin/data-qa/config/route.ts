import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminAuth } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const configKeys = ["clover_output_spec", "qa_instructions"] as const;
type ConfigKey = (typeof configKeys)[number];

const configSchema = z.object({
  clover_output_spec: z.string().trim().min(1).max(50_000),
  qa_instructions: z.string().trim().min(1).max(50_000),
});

const DEFAULT_CONFIG: Record<ConfigKey, { title: string; body: string }> = {
  clover_output_spec: {
    title: "How Clover should show accounts and transactions",
    body:
      "Accounts:\n- Show the account name clearly.\n- Show the account number when available.\n- Show the current or statement balance.\n- Show account type and institution when known.\n- Prefer real statement layouts from Philippine banks over synthetic examples.\n\nTransactions:\n- Show transactions newest-first unless a statement requires a different order.\n- Show date, merchant/description, amount, and category.\n- Keep the raw description available for traceability.\n- Show normalized merchant names when available, but preserve the raw merchant text in detail views.\n- Keep confirmed values stable unless a user or review workflow changes them.\n- Avoid inventing statement fields that do not appear in real bank statements.",
  },
  qa_instructions: {
    title: "Data QA instructions",
    body:
      "1. Find legitimate Statement of Accounts from real Philippine banks, with a preference for popular banks like BPI, BDO, Metrobank, RCBC, UnionBank, GCash, Maya, Security Bank, and similar institutions.\n2. Do not create synthetic statements or invent bank documents. Only use real uploaded files.\n3. Upload or submit files through the same import/processing flow as production imports.\n4. Re-parse older uploaded statements as safe sample files so the parser can learn from real layouts and improve confidence.\n5. Review the parsed output against the raw file and the intended Clover output shape.\n6. Check bank, account number, account type, account balance, transaction count, and the comprehensive list of transactions.\n7. Mark fields correct when they match, or leave notes for improvement.\n8. Read QA findings and look for parser speed regressions, confidence issues, and UI mismatches.\n9. Save structured field feedback and free-text feedback.\n10. If something is wrong, capture the issue, propose the fix, and rerun the QA flow after the parser or UI is updated.\n11. Keep raw data separate from normalized output and never overwrite confirmed financial data.\n12. Prefer deterministic fixes before AI fallback, and turn repeatable improvements into durable rules or tests.",
  },
};

async function ensureDefaults() {
  for (const key of configKeys) {
    await prisma.dataQaConfig.upsert({
      where: { key },
      update: {},
      create: {
        key,
        title: DEFAULT_CONFIG[key].title,
        body: DEFAULT_CONFIG[key].body,
        updatedBy: "system",
      },
    });
  }
}

export async function GET() {
  try {
    await requireAdminAuth();
    await ensureDefaults();

    const records = await prisma.dataQaConfig.findMany({
      where: { key: { in: [...configKeys] } },
      orderBy: { key: "asc" },
    });

    return NextResponse.json({
      configs: records.map((record) => ({
        key: record.key,
        title: record.title,
        body: record.body,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load data QA config";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdminAuth();
    await ensureDefaults();
    const payload = configSchema.parse(await request.json());

    const updates = await Promise.all(
      configKeys.map((key) =>
        prisma.dataQaConfig.upsert({
          where: { key },
          update: {
            title: DEFAULT_CONFIG[key].title,
            body: payload[key],
            updatedBy: "local-admin",
          },
          create: {
            key,
            title: DEFAULT_CONFIG[key].title,
            body: payload[key],
            updatedBy: "local-admin",
          },
        })
      )
    );

    return NextResponse.json({
      configs: updates.map((record) => ({
        key: record.key,
        title: record.title,
        body: record.body,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save data QA config";

    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
