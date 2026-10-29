import { createContext, useContext, useEffect } from "react";
import type { AskPageContext } from "../../shared/ask-clover-page";
export const PageAskContext = createContext<(context: AskPageContext) => void>(() => {});
export const PageAskScopeContext = createContext<(scope: AskPageContext | null) => void>(() => {});
export function usePageAskScope(scope: AskPageContext) {
 const register = useContext(PageAskScopeContext);
 const signature = JSON.stringify(scope);
 useEffect(() => { register(JSON.parse(signature)); return () => register(null); }, [register, signature]);
}
export const usePageAskClover = () => useContext(PageAskContext);
