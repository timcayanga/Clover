import { Modal as NativeModal, type ModalProps } from "react-native";
import { useAccessibilityPreferences } from "./accessibility-preferences";
import { WindowPane } from "./window-pane";
/** Native modals use a separate window and must receive the same hinge and
 * motion policy as the route tree. RN Web supplies focus trapping and Escape. */
export function Modal({ children, animationType, ...props }: ModalProps) {
  const { reduceMotion } = useAccessibilityPreferences();
  return <NativeModal {...props} animationType={reduceMotion ? "none" : animationType}><WindowPane>{children}</WindowPane></NativeModal>;
}
