import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isLocalDevHost, requireAuth } from "@/lib/auth";
import { assertWorkspaceAccess } from "@/lib/workspace-access";
import { classifyMerchant, loadMerchantRules, loadTrainingSignals } from "@/lib/data-engine";
import type { TransactionType } from "@/lib/domain-types";

export const dynamic = "force-dynamic";

type SuggestionWorkspaceCacheEntry = {
  expiresAt: number;
  merchantRules: Awaited<ReturnType<typeof loadMerchantRules>>;
  categories: Array<{ id: string; name: string }>;
  trainingSignals: Awaited<ReturnType<typeof loadTrainingSignals>> | null;
  trainingSignalsExpiresAt: number;
};

const suggestionWorkspaceCache = new Map<string, SuggestionWorkspaceCacheEntry>();
const SUGGESTION_CACHE_TTL_MS = 60_000;
const TRAINING_SIGNAL_CACHE_TTL_MS = 15_000;

const resolveSuggestionRouteUserId = async () => {
  if (await isLocalDevHost()) {
    return "local-admin";
  }

  const { userId } = await requireAuth();
  return userId;
};

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

const loadSuggestionWorkspaceData = async (workspaceId: string) => {
  const cached = suggestionWorkspaceCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const [merchantRules, categories] = await Promise.all([
    loadMerchantRules(workspaceId),
    prisma.category.findMany({
      where: { workspaceId, isArchived: false },
      select: { id: true, name: true, isArchived: true },
    }),
  ]);

  const nextCache: SuggestionWorkspaceCacheEntry = {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    merchantRules,
    categories,
    trainingSignals: cached?.trainingSignals ?? null,
    trainingSignalsExpiresAt: cached?.trainingSignalsExpiresAt ?? 0,
  };

  suggestionWorkspaceCache.set(workspaceId, nextCache);
  return nextCache;
};

const loadSuggestionTrainingSignals = async (workspaceId: string) => {
  const cached = suggestionWorkspaceCache.get(workspaceId);
  if (cached?.trainingSignals && cached.trainingSignalsExpiresAt > Date.now()) {
    return cached.trainingSignals;
  }

  const trainingSignals = await loadTrainingSignals(workspaceId);
  const base = cached ?? {
    expiresAt: Date.now() + SUGGESTION_CACHE_TTL_MS,
    merchantRules: [],
    categories: [],
    trainingSignals: null,
    trainingSignalsExpiresAt: 0,
  };

  suggestionWorkspaceCache.set(workspaceId, {
    ...base,
    trainingSignals,
    trainingSignalsExpiresAt: Date.now() + TRAINING_SIGNAL_CACHE_TTL_MS,
  });

  return trainingSignals;
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

    const { merchantRules, categories } = await loadSuggestionWorkspaceData(payload.workspaceId);

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
          trainingSignals: await loadSuggestionTrainingSignals(payload.workspaceId),
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
