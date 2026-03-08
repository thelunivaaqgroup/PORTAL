import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import {
  useUsersQuery,
  useCreateUser,
  useChangeRole,
  useDeactivateUser,
  useResetPassword,
} from "../hooks/useUsersData";
import UsersTable from "../components/UsersTable";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import Alert from "../../../components/Alert";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";
import { useAuth } from "../../../context/useAuth";
import { usePermissions } from "../../../context/usePermissions";
import { validateEmailDomain, env } from "../../../api/env";
import { canManageRole } from "../../../config/roleHierarchy";
import type { Role } from "../../../config/permissions";

const CREATE_ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER"];

export default function UsersListPage() {
  const { data: users = [], isLoading } = useUsersQuery();
  const createUser = useCreateUser();
  const changeRole = useChangeRole();
  const deactivateUser = useDeactivateUser();
  const resetPasswordMut = useResetPassword();

  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { has, role: actorRole } = usePermissions();
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("EDITOR");
  const [password, setPassword] = useState("");
  const [createError, setCreateError] = useState("");

  const domain = env.ALLOWED_EMAIL_DOMAIN;

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError("");

    if (!has("users:write")) {
      toast("error", "Not authorized");
      return;
    }

    if (!fullName.trim() || !email.trim() || password.length < 8) return;

    if (!validateEmailDomain(email.trim())) {
      setCreateError(`Email must end with @${domain}`);
      return;
    }

    const existing = users.find((u) => u.email === email.trim().toLowerCase());
    if (existing) {
      setCreateError("A user with this email already exists.");
      return;
    }

    try {
      await createUser.mutateAsync({
        fullName: fullName.trim(),
        email: email.trim(),
        role,
        tempPassword: password,
      });
      toast("success", `"${fullName.trim()}" added`);
      setFullName("");
      setEmail("");
      setRole("EDITOR");
      setPassword("");
      setCreateError("");
      setCreateOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create user";
      setCreateError(msg);
    }
  }

  async function handleUpdateRole(id: string, newRole: Role) {
    if (!has("roles:assign")) {
      toast("error", "Not authorized");
      return;
    }
    const target = users.find((u) => u.id === id);
    if (target && actorRole && !canManageRole(actorRole, target.role as Role)) {
      toast("error", "Not authorized");
      return;
    }
    if (actorRole && !canManageRole(actorRole, newRole)) {
      toast("error", "Not authorized to assign this role");
      return;
    }
    try {
      await changeRole.mutateAsync({ id, role: newRole });
      toast("success", `Role updated for "${target?.fullName ?? "User"}"`);
    } catch {
      toast("error", "Failed to update role");
    }
  }

  async function handleDeactivate(id: string) {
    if (!has("users:deactivate")) {
      toast("error", "Not authorized");
      return;
    }
    const user = users.find((u) => u.id === id);
    if (user?.email === currentUser?.email) {
      toast("error", "Cannot deactivate your own account");
      return;
    }
    try {
      await deactivateUser.mutateAsync(id);
      toast("success", `"${user?.fullName ?? "User"}" deactivated`);
    } catch {
      toast("error", "Failed to deactivate user");
    }
  }

  async function handleResetPassword(id: string, newPassword: string) {
    if (!has("password:reset")) {
      toast("error", "Not authorized");
      return;
    }
    const user = users.find((u) => u.id === id);
    try {
      await resetPasswordMut.mutateAsync({ id, newPassword });
      toast("success", `Password reset for "${user?.fullName ?? "User"}"`);
    } catch {
      toast("error", "Failed to reset password");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user accounts and role assignments."
        icon={Users}
        action={
          <Can permission="users:write">
            <Button onClick={() => setCreateOpen(true)}>Add User</Button>
          </Can>
        }
      />

      <UsersTable
        users={users}
        currentUserEmail={currentUser?.email ?? ""}
        onUpdateRole={handleUpdateRole}
        onDeactivate={handleDeactivate}
        onResetPassword={handleResetPassword}
      />

      {/* Add User modal */}
      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setCreateError(""); }}>
        <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Add User
          </h3>
          {createError && (
            <Alert variant="error">{createError}</Alert>
          )}
          <Input
            label="Full Name"
            placeholder="Jane Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
          <div>
            <Input
              label="Email"
              type="email"
              placeholder={domain ? `jane@${domain}` : "jane@example.com"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {domain && (
              <p className="mt-1 text-xs text-gray-500">
                Must be an @{domain} address.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="new-user-role"
              className="block text-sm font-medium text-gray-700"
            >
              Role
            </label>
            <select
              id="new-user-role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
            >
              {CREATE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Initial Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={password.length > 0 && password.length < 8 ? "Must be at least 8 characters." : undefined}
          />
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => { setCreateOpen(false); setCreateError(""); }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!fullName.trim() || !email.trim() || password.length < 8 || createUser.isPending}
            >
              {createUser.isPending ? "Adding..." : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
