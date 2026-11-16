import { useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "./adaptive-modal";
import { PageAskContext, PageAskScopeContext } from "./page-ask-context";
import { AdviserConversation } from "../app/(tabs)/adviser";
import { useSession } from "./session";
import { Icon, useTheme } from "./ui";
import { Text } from "./app-text";
import type { AskPageContext } from "../../shared/ask-clover-page";
/** The route tree stays mounted, preserving the current page and scroll position. */
export function PageAskProvider({ children }: { children: ReactNode }) {
 const [context, setContext] = useState<AskPageContext | null>(null);
 const scope = useRef<AskPageContext | null>(null);
 const register = useCallback((next: AskPageContext | null) => { scope.current = next; }, []);
 const open = useCallback((next: AskPageContext) => { setContext(scope.current?.page === next.page ? {...next,...scope.current} : next); }, []);
 const session = useSession();
 const path = usePathname();
 const {colors} = useTheme();
 const insets = useSafeAreaInsets();
 const {height} = useWindowDimensions();
 useEffect(() => { setContext(null); }, [path, session.profileId]);
 const close = () => setContext(null);
 return <PageAskScopeContext.Provider value={register}><PageAskContext.Provider value={open}>
  {children}
  <Modal visible={Boolean(context)} transparent animationType="slide" onRequestClose={close}>
   <View style={{flex:1, justifyContent:"flex-end"}}>
    <Pressable accessibilityLabel="Close Ask Clover" accessibilityRole="button" onPress={close} style={{position:"absolute",inset:0,backgroundColor:"rgba(11,27,43,0.3)"}} />
    {context ? <View accessibilityViewIsModal style={{height:Math.min(height * 0.88, height-insets.top-12),backgroundColor:colors.bg,borderTopLeftRadius:26,borderTopRightRadius:26,overflow:"hidden"}}>
     <View style={{flexDirection:"row",alignItems:"center",gap:12,padding:16,borderBottomWidth:1,borderBottomColor:colors.line}}>
      <Icon name="chatbubble-ellipses-outline" size={36}/>
      <View style={{flex:1}}><Text style={{color:colors.ink,fontFamily:"Poppins-SemiBold",fontSize:18}}>Ask Clover</Text><Text style={{color:colors.muted,fontSize:12}} numberOfLines={1}>{context.title}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Close Ask Clover" onPress={close} hitSlop={12}><Icon name="close" size={24}/></Pressable>
     </View>
     <AdviserConversation key={`${session.profileId}:${JSON.stringify(context)}`} pageContext={context} embedded onClose={close}/>
    </View> : null}
   </View>
  </Modal>
 </PageAskContext.Provider></PageAskScopeContext.Provider>;
}
