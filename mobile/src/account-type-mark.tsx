import { Image } from "react-native";
import { accountTypeIcon } from "../../shared/visual-identity";
const icons: Record<string, number> = {
  wallet: require("../assets/account-types/wallet.png"),
  bnpl: require("../assets/account-types/bnpl.png"),
  credit_card: require("../assets/account-types/credit_card.png"),
  line_of_credit: require("../assets/account-types/line_of_credit.png"),
  investment: require("../assets/account-types/investment.png"),
  other: require("../assets/account-types/other.png"),
  prepaid: require("../assets/account-types/prepaid.png"),
  receivable: require("../assets/account-types/receivable.png"),
  insurance: require("../assets/account-types/insurance.png"),
  mortgage: require("../assets/account-types/mortgage.png"),
  loan: require("../assets/account-types/loan.png"),
  bank: require("../assets/account-types/bank.png"),
  cash: require("../assets/account-types/cash.png"),
  payable: require("../assets/account-types/payable.png"),
};
export function AccountTypeMark({
  type,
  size = 34,
}: {
  type: string;
  size?: number;
}) {
  return (
    <Image
      source={icons[accountTypeIcon(type)]}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel={`${type.replaceAll("_", " ")} account`}
    />
  );
}
