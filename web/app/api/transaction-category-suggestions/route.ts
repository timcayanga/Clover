import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { classifyMerchant, loadMerchantRules, loadTrainingSignals } from "@/lib/data-engine";
import type { TransactionType } from "@/lib/domain-types";

export const dynamic = "force-dynamic";

const resolveSuggestionRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

const suggestionSchema = z.object({
  workspaceId: z.string().min(1),
  merchantText: z.string().min(1).max(200),
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
    const userId = await resolveSuggestionRouteUserId();
    const payload = suggestionSchema.parse(await request.json());

    await assertWorkspaceAccess(userId, payload.workspaceId);

    const merchantText = payload.merchantText.trim();
    if (merchantText.length < 2) {
      return NextResponse.json({ suggestion: null });
    }

    const [merchantRules, categories] = await Promise.all([
      loadMerchantRules(payload.workspaceId, [{ merchantRaw: merchantText }]),
      prisma.category.findMany({ where: { workspaceId: payload.workspaceId, isArchived: false }, select: { id: true, name: true, type: true } }),
    ]);
    const eligibleCategories = categories.filter(category => category.type === payload.type);
    const namedCategory = eligibleCategories.find(category => normalizeName(category.name) === normalizeName(merchantText) && normalizeName(category.name) !== "other");
    if (namedCategory) return NextResponse.json({ suggestion: {
      categoryId: namedCategory.id, categoryName: namedCategory.name, confidence: 100,
      source: "heuristic", sourceLabel: "category name", reason: "category_name_exact_match",
    } });

    const ruleOnlyResult = classifyMerchant({
      merchantText,
      type: payload.type as TransactionType,
      merchantRules,
      trainingSignals: [],
    });

    const usesDurableSignal =
      ruleOnlyResult.categoryReason.startsWith("rule") || ruleOnlyResult.categoryReason.startsWith("hardcoded");

    const result = usesDurableSignal
      ? ruleOnlyResult
      : classifyMerchant({
          merchantText,
          type: payload.type as TransactionType,
          merchantRules,
          trainingSignals: await loadTrainingSignals(payload.workspaceId, [{ merchantRaw: merchantText }]),
        });

    if (result.categoryName.trim().toLowerCase() === "other") {
      return NextResponse.json({ suggestion: null });
    }

    const category = eligibleCategories.find((entry) => normalizeName(entry.name) === normalizeName(result.categoryName));
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
