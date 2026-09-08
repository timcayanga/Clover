import { createContext, useContext } from "react";
export type Access = {
  active: boolean;
  configured: boolean;
  loaded: boolean;
  enterDemo: () => void;
  signIn: () => Promise<void>;
};
export const AccessContext = createContext<Access>({
  active: false,
  configured: false,
  loaded: true,
  enterDemo: () => {},
  signIn: async () => {},
});
export const useAccess = () => useContext(AccessContext);
