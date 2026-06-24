type CategoryNameLookup = (categoryId: string) => string | null | undefined;

const resolveCategoryDisplayName = (params: {
  categoryId?: string | null;
  explicitName?: string | null;
  lookupName?: string | null | undefined;
}) => {
  if (params.explicitName && params.explicitName.trim()) {
    return params.explicitName.trim();
  }

  if (params.lookupName && params.lookupName.trim()) {
    return params.lookupName.trim();
  }

  if (params.categoryId) {
    return "Other";
  }

  return "Other";
};

export const resolveTransactionCategoryChange = (params: {
  previousCategoryId?: string | null;
  previousCategoryName?: string | null;
  nextCategoryId?: string | null;
  nextCategoryName?: string | null;
  lookupCategoryName?: CategoryNameLookup;
}) => {
  const previousCategoryId = params.previousCategoryId ?? "";
  const nextCategoryId = params.nextCategoryId ?? "";
  const categoryChanged = previousCategoryId !== nextCategoryId;

  const previousCategoryName = resolveCategoryDisplayName({
    categoryId: previousCategoryId,
    explicitName: params.previousCategoryName ?? null,
    lookupName: params.lookupCategoryName?.(previousCategoryId) ?? null,
  });
  const nextCategoryName = resolveCategoryDisplayName({
    categoryId: nextCategoryId,
    explicitName: params.nextCategoryName ?? null,
    lookupName: params.lookupCategoryName?.(nextCategoryId) ?? null,
  });

  return {
    categoryChanged,
    previousCategoryId,
    nextCategoryId,
    previousCategoryName,
    nextCategoryName,
  };
};

export const buildTransactionCategoryUpdatedMessage = (params: {
  previousCategoryName: string;
  nextCategoryName: string;
}) => `Category updated: ${params.previousCategoryName} → ${params.nextCategoryName}. We'll remember this next time.`;
