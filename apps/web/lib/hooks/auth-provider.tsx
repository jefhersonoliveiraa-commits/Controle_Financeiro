"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest, login as loginApi, register as registerApi } from "../api/client";
import { clearTokens, getAccessToken, setTokens } from "../api/token-store";

type UserProfile = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
};

type AuthContextValue = {
  isAuthenticated: boolean;
  user: UserProfile | null;
  loading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const profile = await apiRequest<UserProfile>("/auth/profile");
      setUser(profile);
    } catch {
      clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const result = await loginApi(input);
    setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
  }, []);

  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    const result = await registerApi(input);
    setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      isAuthenticated: !!user,
      user,
      loading,
      login,
      register,
      logout
    }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de AuthProvider.");
  }
  return context;
}
