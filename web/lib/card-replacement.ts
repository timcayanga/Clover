import type { z } from "zod";
import { cardReplacementSchema } from "./card-replacement-input";
import { cardLastFour, supportsCardReplacement, readCardReplacements, type CardReplacement } from "../../shared/card-replacement";
import { prisma } from "./prisma";
import { bankInstitutionsMatch } from "./finverse-matching";

export class CardReplacementError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export async function replaceAccountCard(accountId: string, workspaceId: string, userId: string, input: z.infer<typeof cardReplacementSchema>) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`card-replacement:${workspaceId}`}, 0))`;
    if (!(await tx.workspace.findFirst({ where: { id: workspaceId, user: { clerkUserId: userId } }, select: { id: true } }))) throw new CardReplacementError("Profile not found.", 404);
    const account = await tx.account.findFirst({ where: { id: accountId, workspaceId } });
    if (!account) throw new CardReplacementError("Account not found in this Profile.", 404);
    if (!supportsCardReplacement(account.type)) throw new CardReplacementError("This account does not support replacement cards.", 400);
    const history = readCardReplacements(account.cardNumberHistory);
    if (account.cardNumberHistory !== null && (!Array.isArray(account.cardNumberHistory) || history.length !== account.cardNumberHistory.length)) throw new CardReplacementError("The number history needs attention. Please contact Clover support.");
    const prior = history.find(row => row.requestId === input.requestId);
    if (prior) {
      if (prior.newLastFour !== input.newLastFour || prior.effectiveDate !== input.effectiveDate || prior.reason !== input.reason || prior.previousLastFour !== input.expectedLastFour) throw new CardReplacementError("This replacement request was already used with different details.");
      return account;
    }
    if (cardLastFour(account.accountNumber) !== input.expectedLastFour) throw new CardReplacementError("The card number changed while this form was open. Refresh the account and try again.");
    if (input.newLastFour === input.expectedLastFour) throw new CardReplacementError("The last four digits are unchanged. No replacement is needed.", 400);
    const others = await tx.account.findMany({ where: { workspaceId, currency: account.currency, type: account.type, NOT: { id: accountId } }, select: { institution: true, accountNumber: true, cardNumberHistory: true } });
    if (others.some(other => bankInstitutionsMatch(account.institution, other.institution) && [cardLastFour(other.accountNumber), ...readCardReplacements(other.cardNumberHistory).flatMap(row => [row.previousLastFour, row.newLastFour])].includes(input.newLastFour))) throw new CardReplacementError("Another account at this institution already uses these last four digits. Resolve the account mapping before replacing this card.");
    const entry: CardReplacement = { version: 1, requestId: input.requestId, previousLastFour: input.expectedLastFour, newLastFour: input.newLastFour, effectiveDate: input.effectiveDate, reason: input.reason, confirmedAt: new Date().toISOString(), confirmedBy: userId };
    const updated = await tx.account.updateMany({ where: { id: accountId, workspaceId, updatedAt: account.updatedAt }, data: { accountNumber: `•••• ${input.newLastFour}`, cardNumberHistory: [...history, entry] } });
    if (updated.count !== 1) throw new CardReplacementError("The account changed while saving. Refresh it and try again.");
    return tx.account.findUniqueOrThrow({ where: { id: accountId } });
  });
}
