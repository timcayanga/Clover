type CountableAccountLike = {
  type: string;
  name?: string | null;
  institution?: string | null;
};

const normalizeInstitutionKey = (value: string | null | undefined) => value?.trim().toLowerCase() ?? "";

const getInvestmentInstitutionCountKey = (account: CountableAccountLike) => {
  const institution = normalizeInstitutionKey(account.institution);
  if (institution) {
    return institution;
  }

  return normalizeInstitutionKey(account.name) || "investment";
};

export const countPlanLimitedAccounts = (accounts: CountableAccountLike[]) => {
  let count = 0;
  const investmentInstitutions = new Set<string>();

  for (const account of accounts) {
    if (account.type === "cash") {
      continue;
    }

    if (account.type === "investment") {
      investmentInstitutions.add(getInvestmentInstitutionCountKey(account));
      continue;
    }

    count += 1;
  }

  return count + investmentInstitutions.size;
};

export const countNonCashAccounts = countPlanLimitedAccounts;
