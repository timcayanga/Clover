import { Prisma } from "@prisma/client";

export type DateFilterMode = "ltd" | "day" | "week" | "month" | "quarter" | "year" | "custom";
export type TransactionSortField = "date" | "name" | "account" | "category" | "amount";
export type TransactionSortDirection = "asc" | "desc";

export type TransactionQueryFilters = {
  query?: string;
  currencyFilter?: string;
  categoryIds?: string[];
  accountIds?: string[];
  typeFilters?: Array<"debit" | "credit">;
  merchantFilters?: string[];
  dateFilterMode?: DateFilterMode;
  dateFilterAnchor?: string;
  customStart?: string;
  customEnd?: string;
  sortField?: TransactionSortField;
  sortDirection?: TransactionSortDirection;
  amountMin?: string;
  amountMax?: string;
};

export type TransactionQueryPagination = {
  page?: number;
  pageSize?: number | "all";
};

const startOfDayUtc = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

const endOfDayUtc = (value: string) => new Date(`${value.slice(0, 10)}T23:59:59.999Z`);

const startOfWeekUtc = (value: string) => {
  const date = startOfDayUtc(value);
  const day = date.getUTCDay();
  const offset = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date;
};

const endOfWeekUtc = (value: string) => {
  const date = startOfWeekUtc(value);
  date.setUTCDate(date.getUTCDate() + 6);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfMonthUtc = (value: string) => {
  const date = startOfDayUtc(value);
  date.setUTCDate(1);
  return date;
};

const endOfMonthUtc = (value: string) => {
  const date = startOfMonthUtc(value);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfQuarterUtc = (value: string) => {
  const date = startOfDayUtc(value);
  const quarterStartMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  date.setUTCMonth(quarterStartMonth, 1);
  return date;
};

const endOfQuarterUtc = (value: string) => {
  const date = startOfQuarterUtc(value);
  date.setUTCMonth(date.getUTCMonth() + 3, 0);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const startOfYearUtc = (value: string) => {
  const date = startOfDayUtc(value);
  date.setUTCMonth(0, 1);
  return date;
};

const endOfYearUtc = (value: string) => {
  const date = startOfYearUtc(value);
  date.setUTCMonth(11, 31);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const normalizeFilterValue = (value: string) => value.trim().toLowerCase();

const splitFilterValues = (value: string) =>
  value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

export const parseTransactionQueryFilters = (searchParams: Pick<URLSearchParams, "get" | "getAll">) => {
  const query = searchParams.get("query") ?? searchParams.get("q") ?? "";
  const currencyFilter = searchParams.get("currency") ?? "";
  const categoryIds = [
    ...searchParams.getAll("category"),
    ...searchParams.getAll("categoryId"),
    ...splitFilterValues(searchParams.get("categories") ?? ""),
  ]
    .flatMap((entry) => splitFilterValues(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const accountIds = [
    ...searchParams.getAll("account"),
    ...searchParams.getAll("accountId"),
    ...splitFilterValues(searchParams.get("accounts") ?? ""),
  ]
    .flatMap((entry) => splitFilterValues(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);
  const typeFilters = [
    ...searchParams.getAll("type"),
    ...splitFilterValues(searchParams.get("types") ?? ""),
  ]
    .flatMap((entry) => splitFilterValues(entry))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is "debit" | "credit" => entry === "debit" || entry === "credit");
  const merchantFilters = [
    ...searchParams.getAll("merchant"),
    ...splitFilterValues(searchParams.get("merchants") ?? ""),
  ]
    .flatMap((entry) => splitFilterValues(entry))
    .map((entry) => entry.trim())
    .filter(Boolean);

  const dateFilterMode = (searchParams.get("dateFilterMode") ?? "ltd") as DateFilterMode;
  const dateFilterAnchor = searchParams.get("dateFilterAnchor") ?? "";
  const customStart = searchParams.get("customStart") ?? "";
  const customEnd = searchParams.get("customEnd") ?? "";
  const sortField = (searchParams.get("sortField") ?? "date") as TransactionSortField;
  const sortDirection = (searchParams.get("sortDirection") ?? "desc") as TransactionSortDirection;
  const amountMin = searchParams.get("amountMin") ?? "";
  const amountMax = searchParams.get("amountMax") ?? "";

  return {
    query,
    currencyFilter,
    categoryIds,
    accountIds,
    typeFilters,
    merchantFilters,
    dateFilterMode,
    dateFilterAnchor,
    customStart,
    customEnd,
    sortField,
    sortDirection,
    amountMin,
    amountMax,
  } satisfies TransactionQueryFilters;
};

export const buildTransactionQuerySearchParams = (
  workspaceId: string,
  filters: TransactionQueryFilters,
  pagination: TransactionQueryPagination = {}
) => {
  const params = new URLSearchParams();
  params.set("workspaceId", workspaceId);

  if (filters.query?.trim()) {
    params.set("query", filters.query.trim());
  }

  if (filters.currencyFilter?.trim()) {
    params.set("currency", filters.currencyFilter.trim().toUpperCase());
  }

  filters.categoryIds?.filter(Boolean).forEach((value) => params.append("category", value));
  filters.accountIds?.filter(Boolean).forEach((value) => params.append("account", value));
  filters.typeFilters?.forEach((value) => params.append("type", value));
  filters.merchantFilters?.map((value) => value.trim()).filter(Boolean).forEach((value) => params.append("merchant", value));

  if (filters.dateFilterMode && filters.dateFilterMode !== "ltd") {
    params.set("dateFilterMode", filters.dateFilterMode);
  }

  if (filters.dateFilterAnchor?.trim()) {
    params.set("dateFilterAnchor", filters.dateFilterAnchor.trim());
  }

  if (filters.customStart?.trim()) {
    params.set("customStart", filters.customStart.trim());
  }

  if (filters.customEnd?.trim()) {
    params.set("customEnd", filters.customEnd.trim());
  }

  if (filters.sortField && filters.sortField !== "date") {
    params.set("sortField", filters.sortField);
  }

  if (filters.sortDirection && filters.sortDirection !== "desc") {
    params.set("sortDirection", filters.sortDirection);
  }

  if (filters.amountMin?.trim()) {
    params.set("amountMin", filters.amountMin.trim());
  }

  if (filters.amountMax?.trim()) {
    params.set("amountMax", filters.amountMax.trim());
  }

  if (pagination.page && pagination.page > 1) {
    params.set("page", String(Math.max(1, Math.floor(pagination.page))));
  }

  if (pagination.pageSize === "all") {
    params.set("pageSize", "all");
  } else if (typeof pagination.pageSize === "number" && Number.isFinite(pagination.pageSize) && pagination.pageSize > 0) {
    params.set("pageSize", String(Math.floor(pagination.pageSize)));
  }

  return params;
};

const buildMerchantFilters = (merchantFilters: string[]) =>
  merchantFilters
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ({
      OR: [
        { merchantRaw: { contains: value, mode: "insensitive" as const } },
        { merchantClean: { contains: value, mode: "insensitive" as const } },
        { description: { contains: value, mode: "insensitive" as const } },
      ],
    }));

export const buildTransactionQueryWhere = (workspaceId: string, filters: TransactionQueryFilters): Prisma.TransactionWhereInput => {
  const where: Prisma.TransactionWhereInput = {
    workspaceId,
    deletedAt: null,
  };

  const query = filters.query?.trim();
  const categoryIds = (filters.categoryIds ?? []).filter(Boolean);
  const accountIds = (filters.accountIds ?? []).filter(Boolean);
  const typeFilters = filters.typeFilters ?? [];
  const merchantFilters = (filters.merchantFilters ?? []).filter((value) => normalizeFilterValue(value));
  const dateFilterMode = filters.dateFilterMode ?? "ltd";
  const anchor = filters.dateFilterAnchor ?? new Date().toISOString().slice(0, 10);

  if (query) {
    where.OR = [
      { merchantRaw: { contains: query, mode: "insensitive" } },
      { merchantClean: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
    ];
  }

  const currencyFilter = filters.currencyFilter?.trim().toUpperCase();
  if (currencyFilter) {
    where.currency = currencyFilter;
  }

  if (categoryIds.length > 0) {
    where.categoryId = { in: categoryIds };
  }

  if (accountIds.length > 0) {
    where.accountId = { in: accountIds };
  }

  if (typeFilters.length > 0) {
    where.type =
      typeFilters.length === 2
        ? { in: ["income", "expense"] }
        : typeFilters[0] === "credit"
          ? "income"
          : "expense";
  }

  if (merchantFilters.length > 0) {
    where.AND = [{ OR: buildMerchantFilters(merchantFilters) }];
  }

  if (dateFilterMode !== "ltd") {
    const dateRange =
      dateFilterMode === "day"
        ? { gte: startOfDayUtc(anchor), lte: endOfDayUtc(anchor) }
        : dateFilterMode === "week"
          ? { gte: startOfWeekUtc(anchor), lte: endOfWeekUtc(anchor) }
          : dateFilterMode === "month"
            ? { gte: startOfMonthUtc(anchor), lte: endOfMonthUtc(anchor) }
            : dateFilterMode === "quarter"
              ? { gte: startOfQuarterUtc(anchor), lte: endOfQuarterUtc(anchor) }
              : dateFilterMode === "year"
                ? { gte: startOfYearUtc(anchor), lte: endOfYearUtc(anchor) }
                : {
                    gte: filters.customStart ? startOfDayUtc(filters.customStart) : undefined,
                    lte: filters.customEnd ? endOfDayUtc(filters.customEnd) : undefined,
                  };

    where.date = dateRange;
  }

  const amountMinValue = filters.amountMin?.trim() ?? "";
  const amountMaxValue = filters.amountMax?.trim() ?? "";
  const amountMin = amountMinValue ? Number(amountMinValue) : null;
  const amountMax = amountMaxValue ? Number(amountMaxValue) : null;
  const hasMin = amountMin !== null && Number.isFinite(amountMin);
  const hasMax = amountMax !== null && Number.isFinite(amountMax);
  if (hasMin || hasMax) {
    where.amount = {
      ...(hasMin ? { gte: new Prisma.Decimal(amountMin) } : {}),
      ...(hasMax ? { lte: new Prisma.Decimal(amountMax) } : {}),
    } as Prisma.DecimalFilter;
  }

  return where;
};

export const buildTransactionQueryOrderBy = (
  filters: TransactionQueryFilters
): Prisma.TransactionOrderByWithRelationInput[] => {
  const direction = filters.sortDirection ?? "desc";
  switch (filters.sortField ?? "date") {
    case "name":
      return [
        { merchantClean: direction },
        { merchantRaw: direction },
        { date: "desc" },
      ];
    case "account":
      return [
        { account: { name: direction } },
        { date: "desc" },
      ];
    case "category":
      return [
        { category: { name: direction } },
        { date: "desc" },
      ];
    case "amount":
      return [
        { amount: direction },
        { date: "desc" },
      ];
    case "date":
    default:
      return [{ date: direction }, { createdAt: direction }];
  }
};
