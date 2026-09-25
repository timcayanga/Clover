import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";
import AddTransaction from "./(tabs)/add";
import { DetailNavigation } from "../src/ui";

export default function AddTransactionSheet() {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <AddTransaction />
      <DetailNavigation />
    </View>
  );
}
