import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { useAuth } from "../context/useAuth";
import { useToast } from "../context/useToast";
import { env } from "../api/env";
import Button from "../components/Button";
import Input from "../components/Input";
import Alert from "../components/Alert";
import { Card, CardHeader, CardBody } from "../components/Card";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

type FieldErrors = Partial<Record<"email" | "password", string>>;

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loginError, setLoginError] = useState("");

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
    const loginResult = await login(result.data.email, result.data.password);

    if (!loginResult.ok) {
      setLoginError(loginResult.error);
      toast("error", loginResult.error);
      return;
    }

    toast("success", "Signed in successfully");
    navigate("/dashboard", { replace: true });
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Sign in
        </h1>
        <p className="text-sm text-gray-500">
          Enter your credentials to continue.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold text-gray-900">Login</h2>
        </CardHeader>
        <CardBody>
          {loginError && (
            <Alert variant="error" className="mb-4">
              {loginError}
            </Alert>
          )}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={errors.email}
              />
              {domain && (
                <p className="mt-1 text-xs text-gray-500">
                  Only @{domain} accounts can sign in.
                </p>
              )}
            </div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
