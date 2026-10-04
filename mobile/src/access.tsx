import { createContext, useContext } from "react";
export type Access = {
  active: boolean;
  configured: boolean;
  loaded: boolean;
  welcomeAllowed: boolean;
  authEntry: "sign-in" | "sign-up" | null;
  beginAuthEntry: (mode: "sign-in" | "sign-up") => void;
  accountDeleted: boolean;
  markAccountDeleted: () => void;
  dismissAccountDeleted: () => void;
  enterDemo: () => void;
  signIn: () => Promise<void>;
  signUp: () => Promise<void>;
};
export const AccessContext = createContext<Access>({
  active: false,
  configured: false,
  loaded: true,
  welcomeAllowed: false,
  authEntry: null,
  beginAuthEntry: () => {},
  accountDeleted: false,
  markAccountDeleted: () => {},
  dismissAccountDeleted: () => {},
  enterDemo: () => {},
  signIn: async () => {},
  signUp: async () => {},
});
export const useAccess = () => useContext(AccessContext);
