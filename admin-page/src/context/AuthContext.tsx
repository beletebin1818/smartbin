"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { api } from "@/lib/api/client";
import { roleToDisplay } from "@/lib/roles";
import type { AuthUser } from "@/types";

// ─── Shape ───────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  /** True while we're rehydrating from localStorage on first render */
  loading: boolean;
  login: (user: AuthUser, refreshToken?: string) => void;
  logout: () => void;
  /** Modern login with device security */
  loginWithDevice: (username: string, password: string) => Promise<{
    success: boolean;
    message?: string;
    requiresApproval?: boolean;
    requiresOtp?: boolean;
    deviceId?: number;
    deviceInfo?: any;
    rateLimitExceeded?: boolean;
    remainingAttempts?: number;
    deviceBlocked?: boolean;
    deviceName?: string;
    blockedAt?: string;
    failedOtpAttempts?: number;
  }>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "rb_admin_session";
const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ─── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Rehydrate from localStorage on mount, then verify the session is still
  // valid (not expired/revoked) against the real backend before trusting it.
  useEffect(() => {
    async function rehydrate() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as AuthUser;
        // Basic shape validation before trusting stored data
        if (!parsed?.id || !parsed?.token) return;

        // Make the token available to the axios interceptor immediately
        localStorage.setItem(TOKEN_KEY, parsed.token);

        const res = await api.me();
        if (res.success) {
          setUser(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(TOKEN_KEY);
        }
      } catch {
        // Invalid/expired token — discard the stale session
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TOKEN_KEY);
      } finally {
        setLoading(false);
      }
    }
    rehydrate();
  }, []);

  const login = useCallback((authUser: AuthUser, refreshToken?: string) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authUser));
    localStorage.setItem(TOKEN_KEY, authUser.token);
    if (refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
    setUser(authUser);
  }, []);

  const loginWithDevice = useCallback(async (username: string, password: string) => {
    try {
      const response = await api.login(username, password);
      
      if (response.success && response.accessToken && response.user) {
        const authUser: AuthUser = {
          id: String(response.user.id),
          username: response.user.username,
          name: `${response.user.firstName} ${response.user.lastName || ''}`.trim(),
          role: roleToDisplay(response.user.role),
          status: 'active',
          token: response.accessToken,
        };
        
        login(authUser, response.refreshToken);
        return { success: true };
      } else if (response.requiresApproval) {
        return { 
          success: false, 
          message: response.message || 'Device requires approval',
          requiresApproval: true,
          requiresOtp: response.requiresOtp,
          deviceId: response.deviceId,
          deviceInfo: response.deviceInfo 
        };
      } else if (response.rateLimitExceeded) {
        return {
          success: false,
          message: response.message || 'Too many login attempts',
          rateLimitExceeded: true,
          remainingAttempts: response.remainingAttempts
        };
      } else if (response.deviceBlocked) {
        return {
          success: false,
          message: response.message || 'Device blocked',
          deviceBlocked: true,
          deviceName: response.deviceName,
          blockedAt: response.blockedAt,
          failedOtpAttempts: response.failedOtpAttempts
        };
      } else {
        return { 
          success: false, 
          message: response.message || 'Login failed' 
        };
      }
    } catch (error: any) {
      // Handle 403 Forbidden responses for device approval
      if (error.response?.status === 403 && error.response?.data) {
        const data = error.response.data;
        return {
          success: false,
          message: data.message || 'Device requires approval',
          requiresApproval: data.requiresApproval || false,
          requiresOtp: data.requiresOtp || false,
          deviceId: data.deviceId,
          deviceInfo: data.deviceInfo,
          rateLimitExceeded: data.rateLimitExceeded || false,
          remainingAttempts: data.remainingAttempts,
          deviceBlocked: data.deviceBlocked || false,
          deviceName: data.deviceName,
          blockedAt: data.blockedAt,
          failedOtpAttempts: data.failedOtpAttempts,
        };
      }
      return { 
        success: false, 
        message: error.response?.data?.message || 'Network error occurred' 
      };
    }
  }, [login]);

  const logout = useCallback(() => {
    api.logout().catch(() => {
      // Stateless JWT — backend call is best-effort only
    });
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, loginWithDevice }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
}
