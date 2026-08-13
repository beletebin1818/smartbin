"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import { Eye, EyeOff, Loader2, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api/client";
import { roleToDisplay } from "@/lib/roles";
import type { AuthUser } from "@/types";
import DeviceApprovalWait from "@/components/auth/DeviceApprovalWait";

export default function LoginPage() {
  const { user, loading, login, loginWithDevice } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [deviceBlocked, setDeviceBlocked] = useState(false);
  const [blockedInfo, setBlockedInfo] = useState<any>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/games");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPendingApproval(false);
    setDeviceInfo(null);
    if (!username.trim()) { setError("Username is required."); return; }
    if (!password) { setError("Password is required."); return; }

    setSubmitting(true);
    try {
      const result = await loginWithDevice(username.trim(), password);
      
      console.log('🔍 Login result:', result);
      
      // Handle device approval required with OTP - show OTP input on same page (check first)
      if (result.requiresApproval && result.requiresOtp && result.deviceId) {
        console.log('📱 Showing OTP input (requiresOtp + deviceId)');
        setRequiresOtp(true);
        setDeviceId(result.deviceId);
        setSubmitting(false);
        return;
      }
      
      // Handle device approval required (legacy) - also show OTP input
      if (result.requiresApproval) {
        console.log('📱 Showing OTP input (requiresApproval only)');
        setRequiresOtp(true);
        setDeviceId(result.deviceId || null);
        setSubmitting(false);
        return;
      }
      
      // Handle rate limit exceeded
      if (result.rateLimitExceeded) {
        setError(result.message || "Too many login attempts. Please try again later.");
        setSubmitting(false);
        return;
      }
      
      if (result.success) {
        window.location.href = "/games";
      } else if (result.deviceBlocked) {
        setDeviceBlocked(true);
        setBlockedInfo({
          message: result.message,
          deviceName: result.deviceName,
          blockedAt: result.blockedAt,
          failedOtpAttempts: result.failedOtpAttempts,
        });
        setSubmitting(false);
        return;
      } else {
        setError(result.message ?? "Invalid username or password");
      }
    } catch (err) {
      const message = isAxiosError<{ message?: string }>(err)
        ? err.response?.data?.message ?? "Invalid username or password"
        : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(code: string) {
    setError("");
    if (!code.trim() || code.length !== 6) {
      setError("Please enter a valid 6-digit OTP code.");
      return;
    }
    
    setVerifyingOtp(true);
    try {
      const data = await api.validateOtp(code.trim(), deviceId!);
      
      if (data.success) {
        if (data.accessToken && data.user) {
          const authUser: AuthUser = {
            id: String(data.user.id),
            username: data.user.username,
            name: `${data.user.firstName} ${data.user.lastName || ''}`.trim(),
            role: roleToDisplay(data.user.role),
            status: 'active',
            token: data.accessToken,
          };
          login(authUser, data.refreshToken);
          window.location.href = "/games";
          return;
        }

        // Fallback: login again with credentials if tokens were not returned directly
        const result = await loginWithDevice(username.trim(), password);
        if (result.success) {
          window.location.href = "/games";
        } else {
          setError("Login failed after OTP validation. Please try again.");
          setRequiresOtp(false);
        }
      } else {
        setError(data.message || "Invalid OTP code. Please try again.");
      }
    } catch (err) {
      setError("Failed to validate OTP. Please try again.");
    } finally {
      setVerifyingOtp(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    await verifyOtp(otpCode);
  }

  const handleRetryApproval = async () => {
    setSubmitting(true);
    try {
      const result = await loginWithDevice(username.trim(), password);
      
      if (result.requiresApproval && result.deviceInfo) {
        setDeviceInfo(result.deviceInfo);
        setSubmitting(false);
        return;
      }
      
      if (result.success) {
        // Force redirect immediately
        window.location.href = "/games";
      }
    } catch (err) {
      setError("Still waiting for approval. Please try again later.");
    } finally {
      setSubmitting(false);
    }
  };

  // Show blocked device info
  if (deviceBlocked && blockedInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F26] px-4 py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="rounded-2xl border border-red-900/40 bg-[#171D3D] px-8 py-10 shadow-2xl shadow-black/40">
            <div className="mb-8 flex flex-col items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-500/30"
              >
                <Shield className="h-7 w-7 text-white" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-white">Device Blocked</p>
                <p className="text-sm text-[#B9C0D3]">This device has been locked after multiple failed attempts</p>
              </div>
            </div>

            <div className="space-y-4 rounded-xl border border-red-900/40 bg-red-900/10 p-4 text-sm text-[#B9C0D3]">
              <div className="flex items-center justify-between">
                <span>Device</span>
                <span className="font-semibold text-white">{blockedInfo.deviceName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Failed attempts</span>
                <span className="font-semibold text-red-400">{blockedInfo.failedOtpAttempts}</span>
              </div>
              {blockedInfo.blockedAt && (
                <div className="flex items-center justify-between">
                  <span>Blocked at</span>
                  <span className="font-semibold text-white">{new Date(blockedInfo.blockedAt).toLocaleString()}</span>
                </div>
              )}
              <p className="pt-2 text-xs text-red-300">
                {blockedInfo.message || 'Please contact the administrator to restore access.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => { setDeviceBlocked(false); setBlockedInfo(null); setError(""); }}
              className="mt-6 w-full rounded-xl py-2.5 text-sm font-medium text-[#B9C0D3] hover:text-white transition"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show OTP input when required
  if (requiresOtp) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F26] px-4 py-12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2F7EFF]/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">
          <div className="rounded-2xl border border-[#29345E] bg-[#171D3D] px-8 py-10 shadow-2xl shadow-black/40">
            <div className="mb-8 flex flex-col items-center gap-3">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-[#2F7EFF]/30"
                style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
              >
                <span className="text-2xl font-black text-white leading-none">🔐</span>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-white">Enter Verification Code</p>
                <p className="text-sm text-[#B9C0D3]">A 6-digit code has been sent to your administrator</p>
              </div>
            </div>

            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="otp" className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
                  Verification Code
                </label>
                <input
                  id="otp"
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setOtpCode(val);
                    setError("");
                    if (val.length === 6 && !verifyingOtp) {
                      verifyOtp(val);
                    }
                  }}
                  placeholder="000000"
                  className="w-full rounded-xl border border-[#29345E] bg-[#0B0F26] px-4 py-3 text-center text-2xl font-mono text-white placeholder-[#6C7285] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
                  autoFocus
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-red-900/20 border border-red-800/40 px-3 py-2 text-xs font-medium text-red-400">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={verifyingOtp}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2F7EFF]/25 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 disabled:opacity-60 disabled:pointer-events-none"
                style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
              >
                {verifyingOtp && <Loader2 size={15} className="animate-spin" />}
                {verifyingOtp ? "Verifying..." : "Verify Code"}
              </button>

              <button
                type="button"
                onClick={() => { setRequiresOtp(false); setOtpCode(""); setError(""); }}
                className="w-full rounded-xl py-2.5 text-sm font-medium text-[#B9C0D3] hover:text-white transition"
              >
                Back to Login
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // Show device approval wait screen
  if (pendingApproval && deviceInfo) {
    return <DeviceApprovalWait deviceInfo={deviceInfo} onRetry={handleRetryApproval} />;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0F26]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#2F7EFF] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F26] px-4 py-12">
      {/* Subtle background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2F7EFF]/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-[#29345E] bg-[#171D3D] px-8 py-10 shadow-2xl shadow-black/40">

          {/* Logo */}
          <div className="mb-8 flex flex-col items-center gap-3">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg shadow-[#2F7EFF]/30"
              style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
            >
              <span className="text-2xl font-black text-white leading-none">S</span>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold text-white">Smart Bingo</p>
              <p className="text-sm text-[#B9C0D3]">Admin Dashboard</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Username */}
            <div className="space-y-1.5">
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                placeholder="Enter your username"
                className="w-full rounded-xl border border-[#29345E] bg-[#0B0F26] px-4 py-2.5 text-sm text-white placeholder-[#6C7285] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#6C7285]">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-[#29345E] bg-[#0B0F26] px-4 py-2.5 pr-11 text-sm text-white placeholder-[#6C7285] outline-none transition focus:border-[#2F7EFF] focus:ring-2 focus:ring-[#2F7EFF]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6C7285] hover:text-[#B9C0D3] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p role="alert" className="rounded-lg bg-red-900/20 border border-red-800/40 px-3 py-2 text-xs font-medium text-red-400">
                {error}
              </p>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#2F7EFF]/25 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2F7EFF]/40 disabled:opacity-60 disabled:pointer-events-none"
              style={{ background: 'linear-gradient(135deg, #2F7EFF 0%, #4DA3FF 100%)' }}
            >
              {submitting && <Loader2 size={15} className="animate-spin" />}
              {submitting ? "Signing in…" : "Log In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
