import { prisma } from "@/lib/prisma";
import { extractLastFourDigits, normalizeAccountRuleKey } from "@/lib/data-engine";

type AccountRow = {
  id: string;
  workspaceId: string;
  name: string;
  institution: string | null;
  source: string;
};

type AccountRuleRow = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  ruleKey: string;
  accountName: string;
  institution: string | null;
};

type CheckpointRow = {
  id: string;
  workspaceId: string;
  accountId: string | null;
  sourceMetadata: unknown;
};

type TemplateRow = {
  id: string;
  workspaceId: string;
  institution: string | null;
  accountName: string | null;
  accountNumber: string | null;
  metadata: unknown;
};

const BANK_WORDS = /\b(savings|mastercard|signature|visa|credit\s*card|debit\s*card|passbook|current\s*account|checking|card ending|card)\b/i;

const hasSimpleAccountName = (accountName: string, institution: string) => {
  const normalizedInstitution = institution.trim();
  const simplePattern = new RegExp(`^${escapeRegExp(normalizedInstitution)}(?:\\s+\\d{4})?$`, "i");
  return simplePattern.test(accountName.trim());
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const suffixFromSourceMetadata = (sourceMetadata: unknown) => {
  if (!sourceMetadata || typeof sourceMetadata !== "object" || Array.isArray(sourceMetadata)) {
    return null;
  }

  const metadata = sourceMetadata as Record<string, unknown>;
  const accountNumber =
    typeof metadata.accountNumber === "string"
      ? metadata.accountNumber
      : typeof metadata.cardNumber === "string"
        ? metadata.cardNumber
        : typeof metadata.account === "string"
          ? metadata.account
          : null;
  const accountName = typeof metadata.accountName === "string" ? metadata.accountName : null;

  return extractLastFourDigits(accountNumber) ?? extractLastFourDigits(accountName);
};

const suffixFromTemplate = (template: TemplateRow | undefined) =>
  extractLastFourDigits(template?.accountNumber ?? null) ??
  extractLastFourDigits(template?.accountName ?? null) ??
  suffixFromSourceMetadata(template?.metadata ?? null);

const simpleAccountName = (institution: string, suffix?: string | null) => {
  const trimmed = institution.trim();
  return suffix ? `${trimmed} ${suffix}` : trimmed;
};

const normalizeAccountName = (
  account: AccountRow,
  inferredSuffix: string | null
) => {
  if (!account.institution) {
    return null;
  }

  const institution = account.institution.trim();
  const currentName = account.name.trim();

  if (hasSimpleAccountName(currentName, institution)) {
    return null;
  }

  const currentSuffix = extractLastFourDigits(currentName);
  const currentLooksLikeBankStatement = currentName.toLowerCase().includes(institution.toLowerCase()) || BANK_WORDS.test(currentName);
  const suffix = currentSuffix ?? inferredSuffix;

  if (suffix) {
    return simpleAccountName(institution, suffix);
  }

  if (currentLooksLikeBankStatement) {
    return institution;
  }

  return null;
};

const main = async () => {
  const apply = process.argv.includes("--apply");
  const accounts = (await prisma.account.findMany({
    select: {
      id: true,
      workspaceId: true,
      name: true,
      institution: true,
      source: true,
    },
    orderBy: [{ workspaceId: "asc" }, { institution: "asc" }, { name: "asc" }],
  })) as AccountRow[];

  const checkpoints = (await prisma.accountStatementCheckpoint.findMany({
    select: {
      id: true,
      workspaceId: true,
      accountId: true,
      sourceMetadata: true,
    },
  })) as CheckpointRow[];

  const templates = (await prisma.statementTemplate.findMany({
    select: {
      id: true,
      workspaceId: true,
      institution: true,
      accountName: true,
      accountNumber: true,
      metadata: true,
    },
  })) as TemplateRow[];

  const accountRules = (await prisma.accountRule.findMany({
    select: {
      id: true,
      workspaceId: true,
      accountId: true,
      ruleKey: true,
      accountName: true,
      institution: true,
    },
  })) as AccountRuleRow[];

  const checkpointsByAccountId = new Map<string, CheckpointRow[]>();
  for (const checkpoint of checkpoints) {
    if (!checkpoint.accountId) continue;
    const list = checkpointsByAccountId.get(checkpoint.accountId) ?? [];
    list.push(checkpoint);
    checkpointsByAccountId.set(checkpoint.accountId, list);
  }

  const templatesByWorkspaceAndInstitution = new Map<string, TemplateRow[]>();
  for (const template of templates) {
    if (!template.institution) continue;
    const key = `${template.workspaceId}::${template.institution.trim().toLowerCase()}`;
    const list = templatesByWorkspaceAndInstitution.get(key) ?? [];
    list.push(template);
    templatesByWorkspaceAndInstitution.set(key, list);
  }

  const accountRulesByAccountId = new Map<string, AccountRuleRow[]>();
  const accountRulesByWorkspace = new Map<string, AccountRuleRow[]>();
  const accountRulesByWorkspaceAndKey = new Map<string, AccountRuleRow>();
  for (const rule of accountRules) {
    if (rule.accountId) {
      const list = accountRulesByAccountId.get(rule.accountId) ?? [];
      list.push(rule);
      accountRulesByAccountId.set(rule.accountId, list);
    }

    const workspaceRules = accountRulesByWorkspace.get(rule.workspaceId) ?? [];
    workspaceRules.push(rule);
    accountRulesByWorkspace.set(rule.workspaceId, workspaceRules);
    accountRulesByWorkspaceAndKey.set(`${rule.workspaceId}::${rule.ruleKey}`, rule);
  }

  const changes: Array<{
    accountId: string;
    workspaceId: string;
    from: string;
    to: string;
    source: string;
  }> = [];
  const skipped: Array<{ accountId: string; name: string; institution: string | null; reason: string }> = [];

  for (const account of accounts) {
    if (!["upload", "imported"].includes(account.source)) {
      continue;
    }

    if (!account.institution) {
      continue;
    }

    const relatedCheckpoints = checkpointsByAccountId.get(account.id) ?? [];
    const inferredSuffix =
      extractLastFourDigits(account.name) ??
      relatedCheckpoints
        .map((checkpoint) => suffixFromSourceMetadata(checkpoint.sourceMetadata))
        .find((suffix): suffix is string => Boolean(suffix)) ??
      templates
        .filter((template) => template.workspaceId === account.workspaceId && template.institution?.trim().toLowerCase() === account.institution?.trim().toLowerCase())
        .map((template) => suffixFromTemplate(template))
        .find((suffix): suffix is string => Boolean(suffix)) ??
      (accountRulesByAccountId.get(account.id) ?? [])
        .map((rule) => extractLastFourDigits(rule.accountName))
        .find((suffix): suffix is string => Boolean(suffix)) ??
      null;

    const desiredName = normalizeAccountName(account, inferredSuffix);
    if (!desiredName || desiredName === account.name.trim()) {
      continue;
    }

    changes.push({
      accountId: account.id,
      workspaceId: account.workspaceId,
      from: account.name,
      to: desiredName,
      source: account.source,
    });

    if (!apply) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: { name: desiredName },
      });

      const oldRuleKey = normalizeAccountRuleKey(account.name, account.institution);
      const newRuleKey = normalizeAccountRuleKey(desiredName, account.institution);
      const workspaceRules = accountRulesByWorkspace.get(account.workspaceId) ?? [];
      const conflictingRule = accountRulesByWorkspaceAndKey.get(`${account.workspaceId}::${newRuleKey}`);

      for (const rule of workspaceRules) {
        const matchesAccount = rule.accountId === account.id || rule.ruleKey === oldRuleKey || rule.accountName === account.name;
        if (!matchesAccount) {
          continue;
        }

        if (conflictingRule && conflictingRule.id !== rule.id) {
          continue;
        }

        await tx.accountRule.update({
          where: { id: rule.id },
          data: {
            accountName: desiredName,
            ruleKey: newRuleKey,
            institution: account.institution,
          },
        });

        accountRulesByWorkspaceAndKey.set(`${account.workspaceId}::${newRuleKey}`, {
          ...rule,
          accountName: desiredName,
          ruleKey: newRuleKey,
        });
      }

      for (const checkpoint of relatedCheckpoints) {
        const metadata = checkpoint.sourceMetadata;
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
          continue;
        }

        const nextMetadata = { ...(metadata as Record<string, unknown>) };
        if (typeof nextMetadata.accountName === "string" || typeof nextMetadata.accountName === "undefined") {
          nextMetadata.accountName = desiredName;
        }

        await tx.accountStatementCheckpoint.update({
          where: { id: checkpoint.id },
          data: {
            sourceMetadata: nextMetadata as never,
          },
        });
      }

      for (const template of templates) {
        if (template.workspaceId !== account.workspaceId) {
          continue;
        }

        const accountInstitution = account.institution?.trim().toLowerCase() ?? "";
        const sameInstitution = template.institution?.trim().toLowerCase() === accountInstitution;
        const templateSuffix = suffixFromTemplate(template);
        const templateMatchesOldName =
          template.accountName === account.name ||
          (sameInstitution && (templateSuffix === inferredSuffix || templateSuffix === extractLastFourDigits(account.name)));
        if (!templateMatchesOldName) {
          continue;
        }

        const metadata = template.metadata;
        const nextMetadata =
          metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? { ...(metadata as Record<string, unknown>) }
            : metadata;

        if (nextMetadata && typeof nextMetadata === "object" && !Array.isArray(nextMetadata)) {
          (nextMetadata as Record<string, unknown>).accountName = desiredName;
          if (!(nextMetadata as Record<string, unknown>).institution && account.institution) {
            (nextMetadata as Record<string, unknown>).institution = account.institution;
          }
        }

        await tx.statementTemplate.update({
          where: { id: template.id },
          data: {
            accountName: desiredName,
            institution: account.institution,
            metadata: nextMetadata as never,
          },
        });
      }
    });
  }

  if (changes.length === 0) {
    console.log("No account names needed cleanup.");
    return;
  }

  console.log(apply ? "Applied account name cleanup:" : "Dry run account name cleanup:");
  for (const change of changes) {
    console.log(`- ${change.from} -> ${change.to} (${change.source}, ${change.accountId})`);
  }

  if (!apply) {
    console.log("");
    console.log("Re-run with --apply to update the database.");
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
