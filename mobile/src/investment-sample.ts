import type { AccountRecord } from "./account-editor";
import {
  projectPortfolio,
  type RecordedValuation,
} from "../../shared/investment-portfolio";
const accounts: AccountRecord[] = [
  {
    id: "demo-invest-1",
    name: "Global Equity Fund",
    institution: "Sample Investments",
    type: "investment",
    currency: "PHP",
    balance: "28450.75",
    investmentSubtype: "mutual_fund",
    investmentCostBasis: "25000",
    investmentQuantity: "250",
    investmentStartDate: "2026-06-01",
  },
  {
    id: "demo-invest-2",
    name: "Time Deposit 1234",
    institution: "Sample Investments",
    type: "investment",
    currency: "PHP",
    balance: "52180.25",
    investmentSubtype: "time_deposit",
    investmentPrincipal: "50000",
    investmentStartDate: "2026-06-01",
    investmentMaturityDate: "2027-06-01",
    investmentInterestRate: "4.5",
  },
  {
    id: "demo-invest-3",
    name: "US Equity",
    institution: "Sample Broker",
    type: "investment",
    currency: "USD",
    balance: "1823.40",
    investmentSubtype: "stock",
    investmentSymbol: "AAPL",
    investmentQuantity: "8",
    investmentCostBasis: "1600",
  },
];
export const sampleInvestments: {
  accounts: AccountRecord[];
  holdings: ReturnType<typeof projectPortfolio>;
  history: RecordedValuation[];
  limited: boolean;
} = {
  accounts,
  holdings: projectPortfolio(accounts, []),
  limited: false,
  history: [
    {
      accountId: "demo-invest-1",
      date: "2026-06-01",
      currency: "PHP",
      value: 25000,
    },
    {
      accountId: "demo-invest-1",
      date: "2026-07-15",
      currency: "PHP",
      value: 26870.5,
    },
    {
      accountId: "demo-invest-1",
      date: "2026-09-10",
      currency: "PHP",
      value: 28450.75,
    },
    {
      accountId: "demo-invest-2",
      date: "2026-06-01",
      currency: "PHP",
      value: 50000,
    },
    {
      accountId: "demo-invest-2",
      date: "2026-09-10",
      currency: "PHP",
      value: 52180.25,
    },
    {
      accountId: "demo-invest-3",
      date: "2026-09-10",
      currency: "USD",
      value: 1823.4,
    },
  ],
};
