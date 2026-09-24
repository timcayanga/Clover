import { PLAN_CATALOG } from "../../shared/plan-catalog";

export const connectedBankAllowanceAnswer = `Free includes ${PLAN_CATALOG.free.linkedBanks} connected bank accounts, Plus includes ${PLAN_CATALOG.pro.linkedBanks}, and Pro includes ${PLAN_CATALOG.premium.linkedBanks}. The allowance is shared across all your Profiles. Each linked account counts separately, even when several accounts belong to the same bank. Linked accounts also count toward your plan's overall financial-account allowance.`;

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
    answer: "The bank or Finverse may still be preparing the available data. You can leave the page and use Resume bank sync later. Follow any authorization prompts in the connection flow. If the problem persists, contact support with the bank name, approximate time and error message, without passwords or one-time codes.",
  },
  {
    question: "Are connected balances and transactions always live?",
    answer: "No. Available history, retrieval times and transaction status depend on the bank and provider. Connecting does not guarantee an instant feed or your bank's complete history. Review imported records, pending transactions and dates against your bank's records. Clover preserves user-confirmed account details rather than silently replacing them with every provider refresh.",
  },
  {
    question: "Will syncing or uploading the same statement create duplicates?",
    answer: "Clover uses provider transaction identifiers to avoid importing the same linked transaction again within a connection. A separate connection, statement upload or manual entry may overlap with existing records. Review dates, amounts, references and account assignments before confirming or removing a suspected duplicate.",
  },
  {
    question: "What happens if I downgrade or reach my connected-bank limit?",
    answer: "Clover checks your plan allowance when connecting and selecting bank accounts. Choose only the accounts that fit your remaining allowance. On Free, bank connection and sync require an upgrade to Plus or Pro; previously imported records are preserved. Changing plans does not itself revoke the bank authorization.",
  },
  {
    question: "How do I disconnect a bank or revoke access?",
    answer: "Contact Clover support for help disconnecting a bank connection. Clover does not currently offer a self-service disconnect button. Where your bank or connection provider offers a way to revoke authorization, use that control as well. Deleting a financial account in Clover is not the same as revoking the bank connection and should not be used as a substitute.",
  },
];
