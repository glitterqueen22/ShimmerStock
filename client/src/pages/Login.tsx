import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "../components/ui";

type ViewState = "login" | "forgot-password" | "forgot-sent" | "change-password" | "register";

export default function Login() {
  const { login, forgotPassword, changePassword, register, mustChangePassword } = useAuth();
  const [view, setView] = useState<ViewState>(mustChangePassword ? "change-password" : "login");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Change password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [changeSuccess, setChangeSuccess] = useState(false);

  // Forgot password
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotToken, setForgotToken] = useState("");
  const [forgotMessage, setForgotMessage] = useState("");

  // Register
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regBusinessName, setRegBusinessName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!username.trim() || !password) {
      setError("Please enter your username and password");
      return;
    }

    setLoading(true);
    try {
      const result = await login(username, password);
      if (result.mustChangePassword) {
        setCurrentPassword(password);
        setView("change-password");
        return;
      }
      // AuthContext will trigger redirect via App.tsx
    } catch (err: any) {
      setError(err.message || "Invalid username or password");
    } finally {
      setLoading(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
      await changePassword(currentPassword, newPassword, confirmNew);
      setChangeSuccess(true);
    } catch (err: any) {
      setError(err.message || "Password change failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!forgotUsername.trim()) {
      setError("Please enter your username");
      return;
    }

    setLoading(true);
    try {
      const result = await forgotPassword(forgotUsername);
      if (result.resetToken) {
        setForgotToken(result.resetToken);
      }
      setForgotMessage(result.message);
      setView("forgot-sent");
    } catch (err: any) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!regUsername.trim() || !regPassword || !regDisplayName.trim() || !regBusinessName.trim()) {
      setError("All fields are required");
      return;
    }

    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      await register(regUsername, regPassword, regDisplayName, regBusinessName);
      // AuthContext will trigger redirect via App.tsx
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  function resetToLogin() {
    setView("login");
    setError(null);
    setForgotUsername("");
    setForgotToken("");
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
            {view === "change-password" ? "Change your password" :
             view === "forgot-password" ? "Reset your password" :
             view === "forgot-sent" ? "Recovery options" :
             view === "register" ? "Create your account" :
             "Sign in to continue"}
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg shadow-rose-200/30 border border-rose-100 p-8">

          {/* ── LOGIN FORM ──────────────────────────────────── */}
          {view === "login" && (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="bg-danger-light border border-danger text-danger-dark rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="username" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Enter your username"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Enter your password"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                Sign In
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => { setView("forgot-password"); setError(null); }}
                  className="text-sm text-rose-400 hover:text-rose-600 font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <div className="text-center pt-2 border-t border-rose-50">
                <button
                  type="button"
                  onClick={() => { setView("register"); setError(null); }}
                  className="text-sm text-rose-500 hover:text-rose-700 font-semibold transition-colors"
                >
                  Create Account
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD FORM ──────────────────────── */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              {error && (
                <div className="bg-danger-light border border-danger text-danger-dark rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <p className="text-sm text-gray-600">
                Enter your username to check the available recovery option.
              </p>

              <div>
                <label htmlFor="forgot-username" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Username
                </label>
                <input
                  id="forgot-username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={forgotUsername}
                  onChange={(e) => setForgotUsername(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Enter your username"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                Check Recovery Options
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-sm text-rose-400 hover:text-rose-600 font-medium transition-colors"
                >
                  ← Back to login
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT SENT CONFIRMATION ──────────────────── */}
          {view === "forgot-sent" && (
            <div className="space-y-5">
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2">
                <span>ℹ️</span>
                <span>{forgotMessage}</span>
              </div>

              {forgotToken && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs font-mono break-all">
                  <p className="font-semibold mb-1">⚠️ Dev mode — reset token:</p>
                  <p>{forgotToken}</p>
                  <p className="mt-2 text-amber-600">
                    Copy this token and go to <code className="bg-amber-100 px-1 rounded">/reset-password?token=...</code>
                  </p>
                </div>
              )}

              <div className="text-center">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-sm text-rose-400 hover:text-rose-600 font-medium transition-colors"
                >
                  ← Back to login
                </button>
              </div>
            </div>
          )}

          {/* ── REGISTER FORM ──────────────────────────────── */}
          {view === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              {error && (
                <div className="bg-danger-light border border-danger text-danger-dark rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label htmlFor="reg-displayname" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Your Name
                </label>
                <input
                  id="reg-displayname"
                  type="text"
                  autoFocus
                  value={regDisplayName}
                  onChange={(e) => setRegDisplayName(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="What should we call you?"
                />
              </div>

              <div>
                <label htmlFor="reg-businessname" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Business Name
                </label>
                <input
                  id="reg-businessname"
                  type="text"
                  value={regBusinessName}
                  onChange={(e) => setRegBusinessName(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Your shop or brand name"
                />
              </div>

              <div>
                <label htmlFor="reg-username" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Username
                </label>
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="Choose a username"
                />
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-sm font-semibold text-rose-500 mb-1.5">
                  Password
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  disabled={loading}
                  className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                             focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                             transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                             disabled:opacity-50"
                  placeholder="At least 8 characters"
                />
              </div>

              <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                Create Account
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={resetToLogin}
                  className="text-sm text-rose-400 hover:text-rose-600 font-medium transition-colors"
                >
                  ← Back to login
                </button>
              </div>
            </form>
          )}

          {/* ── CHANGE PASSWORD FORM ──────────────────────── */}
          {view === "change-password" && (
            <form onSubmit={handleChangePassword} className="space-y-5">
              {changeSuccess ? (
                <>
                  <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                    <span>✅</span>
                    <span>Password changed successfully!</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Please log in again with your new password.
                  </p>
                  <Button variant="primary" size="lg" className="w-full" onClick={() => { setView("login"); setChangeSuccess(false); setPassword(""); }}>
                    Go to Login
                  </Button>
                </>
              ) : (
                <>
                  {error && (
                    <div className="bg-danger-light border border-danger text-danger-dark rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
                      <span>⚠️</span>
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm">
                    ⚠️ You must change your password before continuing.
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-rose-500 mb-1.5">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      disabled={loading}
                      className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                                 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                                 transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                                 disabled:opacity-50"
                      placeholder="Enter current password"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-rose-500 mb-1.5">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      disabled={loading}
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
                      value={confirmNew}
                      onChange={(e) => setConfirmNew(e.target.value)}
                      disabled={loading}
                      className="touch-target w-full px-4 py-3 border border-rose-200 rounded-xl text-sm
                                 focus:border-rose-400 focus:ring-2 focus:ring-rose-200 outline-none
                                 transition-all duration-300 bg-rose-50/50 placeholder:text-rose-300
                                 disabled:opacity-50"
                      placeholder="Re-enter new password"
                    />
                  </div>

                  <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                    Change Password
                  </Button>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
