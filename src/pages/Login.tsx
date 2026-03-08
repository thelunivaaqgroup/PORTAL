import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { ShieldCheck, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { env } from "../api/env";
import Button from "../components/Button";
import Input from "../components/Input";
import Alert from "../components/Alert";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

const SAVED_EMAIL_KEY = "portal_saved_email";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const savedEmail = localStorage.getItem(SAVED_EMAIL_KEY) ?? "";

  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(!!savedEmail);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const domain = env.ALLOWED_EMAIL_DOMAIN;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoginError("");

    const result = loginSchema.safeParse({ email, password });

    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FieldErrors;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setSubmitting(true);

    // Save or clear email based on remember me
    if (rememberMe) {
      localStorage.setItem(SAVED_EMAIL_KEY, result.data.email);
    } else {
      localStorage.removeItem(SAVED_EMAIL_KEY);
    }

    const loginResult = await login(result.data.email, result.data.password);
    setSubmitting(false);

    if (!loginResult.ok) {
      setLoginError(loginResult.error);
      toast("error", loginResult.error);
      return;
    }

    toast("success", "Signed in successfully");
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="flex min-h-screen">
      {/* Brand panel — left */}
      <div className="hidden lg:flex lg:w-[58%] flex-col justify-between bg-gradient-to-br from-rose-700 via-rose-800 to-rose-950 p-12 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
              <ShieldCheck className="h-6 w-6 text-white" />
            </div>
            <span className="text-2xl font-bold tracking-tight">Portal</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">
            Skincare Product Lifecycle
            <br />
            & Compliance Management
          </h1>
          <p className="max-w-md text-lg text-rose-200 leading-relaxed">
            Manage formulations, ensure regulatory compliance across regions,
            track inventory and manufacturing — from concept to shelf.
          </p>
          <div className="flex gap-6 pt-4">
            <div>
              <p className="text-3xl font-bold">AU / IN</p>
              <p className="text-sm text-rose-300">Regional Coverage</p>
            </div>
            <div className="w-px bg-rose-600" />
            <div>
              <p className="text-3xl font-bold">AICIS</p>
              <p className="text-sm text-rose-300">Compliant</p>
            </div>
            <div className="w-px bg-rose-600" />
            <div>
              <p className="text-3xl font-bold">GMP</p>
              <p className="text-sm text-rose-300">Ready</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-rose-400">
          The Lunivaaq Group &mdash; Enterprise Compliance Platform
        </p>
      </div>

      {/* Login form — right */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-gray-50">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-4">
            <ShieldCheck className="h-8 w-8 text-rose-700" />
            <span className="text-2xl font-bold text-gray-900">Portal</span>
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              Welcome back
            </h2>
            <p className="text-sm text-gray-500">
              Sign in to your account to continue
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            {loginError && (
              <Alert variant="error" className="mb-4">
                {loginError}
              </Alert>
            )}
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div>
                <Input
                  label="Email"
                  type="email"
                  placeholder="you@thelunivaaqgroup.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  error={errors.email}
                />
                {domain && (
                  <p className="mt-1 text-xs text-gray-400">
                    Only @{domain} accounts can sign in.
                  </p>
                )}
              </div>

              {/* Password field with eye toggle */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`block w-full rounded-lg border bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                      errors.password
                        ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                        : "border-gray-300 focus:border-rose-500 focus:ring-rose-500"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-sm text-red-600">{errors.password}</p>
                )}
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-sm text-gray-600">Remember my email</span>
              </label>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400">
            Designed by Stableridgesystem &copy; 2026. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
