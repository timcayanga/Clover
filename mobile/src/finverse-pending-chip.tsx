import { Alert, Pressable, View } from "react-native";
import { CANCEL_BANK_LINK_MESSAGE, type PendingBankConnection } from "../../shared/finverse-pending";
import { BankLogo } from "./finverse-bank-picker";
import { Text } from "./app-text";
import { useTheme } from "./ui";
export function confirmCancelBankLink(cancel: () => void) {
  Alert.alert("Cancel linking?", CANCEL_BANK_LINK_MESSAGE, [{text:"Keep linking",style:"cancel"},{text:"Cancel linking",style:"destructive",onPress:cancel}]);
}
export function FinversePendingChip({connection,busy,resumeDisabled,onResume,onCancel}:{connection:PendingBankConnection;busy:boolean;resumeDisabled?:boolean;onResume:()=>void;onCancel:()=>void}) {
  const {colors}=useTheme();
  return <View style={{flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:colors.line,borderRadius:24}}>
    <Pressable accessibilityRole="button" disabled={busy||resumeDisabled} onPress={onResume} style={{flex:1,flexDirection:"row",alignItems:"center",gap:8,paddingLeft:12,paddingVertical:8,minHeight:44,opacity:busy||resumeDisabled?0.5:1}}>
      <BankLogo path={connection.logoUrl||"/assets/account-types/bank.png"} size={24}/><Text style={{flexShrink:1,color:colors.teal,fontSize:13}}>Finish linking {connection.name}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`Cancel linking ${connection.name}`} disabled={busy} onPress={()=>confirmCancelBankLink(onCancel)} style={{width:44,minHeight:44,alignItems:"center",justifyContent:"center",opacity:busy?0.5:1}}><Text style={{fontSize:22,color:colors.teal}}>×</Text></Pressable>
  </View>;
}
