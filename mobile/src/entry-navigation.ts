import { createContext, useContext } from "react";
export const EntryNavigationContext = createContext<(action: () => void) => void>(action => action());
export const useEntryNavigation = () => useContext(EntryNavigationContext);
