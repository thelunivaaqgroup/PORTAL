import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "../api/auth.types";
import { api } from "../api/client";
import { tokenStore } from "../api/tokenStore";
import { ApiError } from "../api/errors";
import { AuthContext } from "./authContextValue";
import type { AuthContextValue, LoginResult } from "./authContextValue";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(() => !!tokenStore.getAccessToken());

  // On mount: if a stored token exists, try to restore the session
  useEffect(() => {
    if (!tokenStore.getAccessToken()) return;
    let cancelled = false;
    api.auth
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        // Token invalid/expired — clear it
        tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setBooting(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    try {
      const u = await api.auth.login({ email, password });
      setUser(u);
      return { ok: true };
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed";
      return { ok: false, error: message };
    }
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: user !== null,
      user,
      login,
      logout,
    }),
    [user, login, logout],
  );

  // While restoring session, show nothing (avoids flash redirect to /login)
  if (booting) {
    return null;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
