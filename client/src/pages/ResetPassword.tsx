import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "../components/ui";

/**
 * Reset password page — accepts ?token= from URL params.
 * Allows a user to set a new password using a valid reset token.
 */
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token") || "";
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Missing reset token. Please use the link from your reset email.");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmNew) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Password reset failed");
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{
           background: "linear-gradient(135deg, #fdf2f5 0%, #ffdae1 50%, #f7e8ec 100%)",
           backgroundAttachment: "fixed",
         }}>
      <div className="w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-8">
          <span className="text-5xl drop-shadow-sm block mb-3">✨</span>
          <h1 className="text-3xl font-bold font-[family-name:var(--font-heading)] text-[#121212]">
            ShimmerStock
          </h1>
          <p className="text-rose-400 mt-2 text-sm font-medium">
            Set a new password
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg shadow-rose-200/30 border border-rose-100 p-8">
          {success ? (
            <div className="space-y-5">
              <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                <span>✅</span>
                <span>Password has been reset successfully!</span>
              </div>
              <p className="text-sm text-gray-600">
                You've been logged out of all devices. Please sign in with your new password.
              </p>
              <Button variant="primary" size="lg" className="w-full" onClick={() => navigate("/login")}>
                Go to Login
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-danger-light border border-danger text-danger-dark rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {!token && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
                  No reset token found. Please use the link from your password reset email.
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-rose-500 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading || !token}
                  autoFocus
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="At least 8 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmNew}
                  onChange={(e) => setConfirmNew(e.target.value)}
                  disabled={loading || !token}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Re-enter new password"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!token} className="w-full">
                Reset Password
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="text-sm text-rose-400 hover:text-rose-600 font-medium transition-colors"
                >
                  ← Back to login
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
