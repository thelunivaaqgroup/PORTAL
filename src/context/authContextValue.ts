import { createContext } from "react";
import type { AuthState } from "../api/auth.types";

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export type AuthContextValue = AuthState & {
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
