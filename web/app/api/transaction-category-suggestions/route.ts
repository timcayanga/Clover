import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { classifyMerchant, loadMerchantRules, loadTrainingSignals } from "@/lib/data-engine";
import type { TransactionType } from "@/lib/domain-types";

export const dynamic = "force-dynamic";

const suggestionSchema = z.object({
  workspaceId: z.string().min(1),
  merchantText: z.string().min(1),
  type: z.enum(["income", "expense", "transfer"]).default("expense"),
});

const normalizeName = (value: string) => value.trim().toLowerCase();

const mapSuggestionSource = (categoryReason: string) => {
  if (categoryReason.startsWith("rule")) {
    return "merchant_rule" as const;
  }

  if (categoryReason.startsWith("learned")) {
    return "training_signal" as const;
  }

  return "heuristic" as const;
};

const mapSuggestionLabel = (categoryReason: string) => {
  if (categoryReason.startsWith("rule")) {
    return "trained merchant rules";
  }

  if (categoryReason.startsWith("learned")) {
    return "confirmed transaction history";
  }

  if (categoryReason.startsWith("hardcoded")) {
    return "Clover keyword hints";
  }

  return "merchant keyword hints";
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const payload = suggestionSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const merchantText = payload.merchantText.trim();
    if (merchantText.length < 2) {
      return NextResponse.json({ suggestion: null });
    }

    const [merchantRules, trainingSignals, categories] = await Promise.all([
      loadMerchantRules(payload.workspaceId),
      loadTrainingSignals(payload.workspaceId),
      prisma.category.findMany({
        where: { workspaceId: payload.workspaceId },
        select: { id: true, name: true },
      }),
    ]);

    const result = classifyMerchant({
      merchantText,
      type: payload.type as TransactionType,
      merchantRules,
      trainingSignals,
    });

    if (result.categoryName.trim().toLowerCase() === "other") {
      return NextResponse.json({ suggestion: null });
    }

    const category = categories.find((entry) => normalizeName(entry.name) === normalizeName(result.categoryName));
    if (!category) {
      return NextResponse.json({ suggestion: null });
    }

    if (result.confidence < 60 && !result.categoryReason.startsWith("rule") && !result.categoryReason.startsWith("learned")) {
      return NextResponse.json({ suggestion: null });
    }

    return NextResponse.json({
      suggestion: {
        categoryId: category.id,
        categoryName: category.name,
        confidence: result.confidence,
        source: mapSuggestionSource(result.categoryReason),
        sourceLabel: mapSuggestionLabel(result.categoryReason),
        reason: result.categoryReason,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unable to suggest category" }, { status: 400 });
  }
}
