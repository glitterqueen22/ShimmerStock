import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { AUTH_REQUIRED_EVENT } from "../lib/api";

interface Business {
  business_id: number;
  name: string;
  slug: string;
  role: string;
  is_active: number;
}

interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
  business_id: number;
  business_name?: string;
  business_role?: string;
  businesses?: Business[];
}

interface LoginResponse {
  user: User;
  token?: string;
  mustChangePassword?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  forgotPassword: (username: string) => Promise<{ resetToken?: string; message: string }>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  register: (username: string, password: string, displayName: string, businessName: string) => Promise<LoginResponse>;
  switchBusiness: (businessId: number) => Promise<void>;
  isAuthenticated: boolean;
  loading: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const clearAuthState = useCallback(() => {
    setUser(null);
    setMustChangePassword(false);
  }, []);

  // On mount, validate the existing cookie-backed session
  useEffect(() => {
    fetch("/api/auth/me", {
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok) throw new Error("Invalid session");
        return res.json();
      })
      .then((nextUser) => {
        setUser(nextUser);
      })
      .catch(() => {
        clearAuthState();
      })
      .finally(() => setLoading(false));
  }, [clearAuthState]);

  useEffect(() => {
    const handleAuthRequired = () => clearAuthState();
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, [clearAuthState]);

  const login = useCallback(async (username: string, password: string): Promise<LoginResponse> => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Login failed" }));
      throw new Error(data.error || "Login failed");
    }

    const data: LoginResponse = await res.json();
    setUser(data.user);

    if (data.mustChangePassword) {
      setMustChangePassword(true);
    }

    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // Best effort
    }
    clearAuthState();
  }, [clearAuthState]);

  const logoutAll = useCallback(async () => {
    const res = await fetch("/api/auth/logout-all", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Failed" }));
      throw new Error(data.error || "Logout all failed");
    }
    clearAuthState();
  }, [clearAuthState]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Failed" }));
      throw new Error(data.error || "Password change failed");
    }
    setMustChangePassword(false);
  }, []);

  const forgotPassword = useCallback(async (username: string) => {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }, []);

  const resetPassword = useCallback(async (resetToken: string, newPassword: string) => {
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token: resetToken, newPassword }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Reset failed" }));
      throw new Error(data.error || "Password reset failed");
    }
  }, []);

  const register = useCallback(async (
    username: string,
    password: string,
    displayName: string,
    businessName: string
  ): Promise<LoginResponse> => {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password, displayName, businessName }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Registration failed" }));
      throw new Error(data.error || "Registration failed");
    }

    const data: LoginResponse = await res.json();
    setUser(data.user);
    return data;
  }, []);

  const switchBusiness = useCallback(async (businessId: number) => {
    const res = await fetch(`/api/businesses/${businessId}/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Failed to switch" }));
      throw new Error(data.error || "Failed to switch business");
    }
    const data = await res.json();

    // Update user state with new business info
    setUser((prev) => {
      if (!prev) return prev;
      // Update which business is active in the businesses list
      const updatedBusinesses = (prev.businesses || []).map(b => ({
        ...b,
        is_active: b.business_id === businessId ? 1 : 0,
      }));
      return {
        ...prev,
        business_id: data.business_id,
        business_name: data.business_name,
        business_role: data.business_role,
        businesses: updatedBusinesses,
      };
    });

    // Store active business in localStorage for persistence
    localStorage.setItem("shimmerstock_active_business", String(businessId));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        logoutAll,
        changePassword,
        forgotPassword,
        resetPassword,
        register,
        switchBusiness,
        isAuthenticated: !!user,
        loading,
        mustChangePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
