import { useEffect, type ReactNode } from "react";
import { EntryNavigationContext } from "./entry-navigation";
import { onImportQueued } from "./import-handoff";
import { Modal, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function EntryOverlay({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  useEffect(() => onImportQueued(onClose), [onClose]);
  return (
    <Modal
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
          backgroundColor: "#0005",
        }}
      >
        <EntryNavigationContext.Provider value={action => { onClose(); setTimeout(action, 400); }}><View style={{ flex: 1 }}>{children}</View></EntryNavigationContext.Provider>

      </View>
    </Modal>
  );
}
