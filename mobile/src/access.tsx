import { createContext, useContext } from "react";
export type Access = {
  active: boolean;
  configured: boolean;
  loaded: boolean;
  welcomeAllowed: boolean;
  enterDemo: () => void;
  signIn: () => Promise<void>;
  signUp: () => Promise<void>;
};
export const AccessContext = createContext<Access>({
  active: false,
  configured: false,
  loaded: true,
  welcomeAllowed: false,
  enterDemo: () => {},
  signIn: async () => {},
  signUp: async () => {},
});
export const useAccess = () => useContext(AccessContext);
