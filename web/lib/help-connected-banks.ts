import { PLAN_CATALOG } from "../../shared/plan-catalog";

export const connectedBankAllowanceAnswer = `Free includes ${PLAN_CATALOG.free.linkedBanks} connected bank accounts, Plus includes ${PLAN_CATALOG.pro.linkedBanks}, and Pro includes ${PLAN_CATALOG.premium.linkedBanks}. The allowance is shared across all your Profiles and counts distinct accounts during each monthly subscription period. Unlinking does not free a slot until the next period. Reconnecting the same account uses no additional slot. Each linked account counts separately, even when several accounts belong to the same bank. Linked accounts also count toward your plan's overall financial-account allowance.`;

export const connectedBankQuestions = [
  {
    question: "What is a connected bank account?",
    answer: "A connected bank account lets Clover retrieve available account and transaction data through Finverse after you authorize the connection. It is different from manually adding an account or uploading a statement: those actions do not create a bank connection.",
  },
  { question: "How many bank accounts can I connect on Free, Plus or Pro?", answer: connectedBankAllowanceAnswer },
  {
    question: "How do I connect a bank account?",
    answer: "Select the Profile that should receive the accounts, open the Connect your bank option, and choose a bank from the list. Complete the authorization through Finverse, then return to Clover. If Clover asks you to select accounts, choose accounts within your remaining allowance and select Sync selected accounts. Review the imported account details and transactions.",
  },
  {
    question: "Which banks can I connect?",
    answer: "Use the bank list shown in Connect your bank for current availability. Availability can vary by bank, region and account type. A bank logo or support for its uploaded statements does not necessarily mean a live connection is available. If your bank is missing, use Manual or Upload instead.",
  },
  {
    question: "Do manual accounts or statement uploads use my connected-bank allowance?",
    answer: "No. Only accounts linked through the bank connection use that allowance. Manual accounts and accounts created from statements or screenshots still count toward your overall financial-account allowance. Free can use Manual and Upload without connecting a bank.",
  },
  {
    question: "Does Clover ask for my bank password or let me send money?",
    answer: "Bank authorization happens through Finverse's connection flow. Do not enter your bank password into Clover support messages or upload it in a file. The connection is used to retrieve account and transaction data; it does not provide a way to send money from Clover.",
  },
  {
    question: "Why is my connected bank still retrieving data?",
    answer: "The bank or Finverse may still be preparing the available data. You can leave the page and select your pending accounts from the action at the top of Accounts later. Follow any authorization prompts in the connection flow. If the problem persists, contact support with the bank name, approximate time and error message, without passwords or one-time codes.",
  },
  {
    question: "Are connected balances and transactions always live?",
    answer: "No. Available history, retrieval times and transaction status depend on the bank and provider. Connecting does not guarantee an instant feed or your bank's complete history. Review imported records, pending transactions and dates against your bank's records. Clover displays the last retrieved bank balance separately from saved opening balances and confirmed account details.",
  },
  {
    question: "Will syncing or uploading the same statement create duplicates?",
    answer: "Clover recognizes provider transaction IDs across reconnections and matches existing entries using the account, currency, date, amount, direction and transaction text. Matching records keep your edits and categories. Uncertain overlaps are flagged for review; pending bank entries wait until posted.",
  },
  {
    question: "What happens if I downgrade or reach my connected-bank limit?",
    answer: "Clover checks your plan allowance when connecting and selecting bank accounts. Choose only the accounts that fit your remaining allowance. On Free, bank connection and sync require an upgrade to Plus or Pro; previously imported records are preserved. Changing plans does not itself revoke the bank authorization.",
  },
  {
    question: "How do I disconnect a bank or revoke access?",
    answer: "Choose Unlink in Account Details or Add Transaction → Sync. Your account and history stay in Clover, and its monthly slot stays reserved. Other linked accounts keep working. When the final account for a bank authorization is unlinked, Clover also revokes that Finverse authorization.",
  },
];
