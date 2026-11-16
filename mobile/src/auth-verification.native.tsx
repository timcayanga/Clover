import { Image, View } from "react-native";
import { AuthView } from "@clerk/expo/native";
export function AuthVerification({ signup }: { signup: boolean }) {
  return <View style={{ minHeight: 580, flex: 1 }}><AuthView mode={signup ? "signUp" : "signIn"} isDismissible={false} logo={<Image source={require("../assets/welcome-clover.png")} accessibilityLabel="Clover" style={{ width: 48, height: 48 }} />} /></View>;
}
