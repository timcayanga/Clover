// Approved Accounts wallets: Playground 42:3369 / 43:3680.
export const walletFinish = {
  light: { shell: "#D6CEC3", edge: "#A99D8D", thread: "#F1E6D5", holes: "#8B7C6D", threadOpacity: .9, threadWidth: 1.1 },
  dark: { shell: "#30383D", edge: "#58636A", thread: "#A6AAA9", holes: "#0E1417", threadOpacity: .52, threadWidth: .9 },
} as const;
export const walletGeometry = { radius: 22, inset: 6, overlap: 16, stitchInset: 3.2, stitchRadius: 18 } as const;
export const genericAccountColors: Record<string, [string, string, string]> = {
  bank: ["#D9F6F8", "#90DEE8", "#45BED3"],
  cash: ["#DCFCE7", "#A2EFBF", "#4ADE80"],
  investment: ["#EDE9FE", "#CABBFA", "#A78BFA"],
  wallet: ["#D7F3FE", "#98DDF9", "#38BDF8"],
  credit_card: ["#FFE5D0", "#F9C694", "#EEAB70"],
  loan: ["#FEE2E2", "#F9BABA", "#F58C8C"],
  mortgage: ["#E3E8FC", "#B5C3F4", "#8CA5E8"],
  line_of_credit: ["#FDE4EF", "#F5BED5", "#EC94BB"],
  receivable: ["#D9F4EF", "#A4DDD2", "#70C6B5"],
  payable: ["#FFE3E3", "#F5B5BF", "#E995A5"],
  bnpl: ["#FFEDD5", "#FED7AA", "#FDBA74"],
  prepaid: ["#DBEAFE", "#B9D7FA", "#93C5FD"],
  insurance: ["#E0E7FF", "#BCC8FA", "#A5B4FC"],
  other: ["#E9E8EB", "#CFCDD5", "#B7B4C1"],
};

export const institutionAccountPalettes: Record<string, { colors: [string, string, string]; foreground: string }> = {
    bpi: { colors: ["#980018", "#C80020", "#A8001C"], foreground: "#FFFFFF" },
    metrobank: { colors: ["#001888", "#18359F", "#001888"], foreground: "#FFFFFF" },
    maya: { colors: ["#05070A", "#14241E", "#05070A"], foreground: "#FFFFFF" },
    unionbank: { colors: ["#F85010", "#F87808", "#F86010"], foreground: "#3C1706" },
    rcbc: { colors: ["#1080D0", "#20B0E8", "#1088D0"], foreground: "#062D46" },
    gcash: { colors: ["#0028B8", "#0078F8", "#0064DE"], foreground: "#FFFFFF" },
  };
