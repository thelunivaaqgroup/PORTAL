import { useState, type FormEvent } from "react";
import DataTable, { type Column } from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import ConfirmDialog from "../../../components/ConfirmDialog";
import type { Role } from "../../../config/permissions";
import { usePermissions } from "../../../context/usePermissions";
import { canManageRole, getAssignableRoles } from "../../../config/roleHierarchy";
import type { UserRow } from "../types";

type UsersTableProps = {
  users: UserRow[];
  currentUserEmail: string;
  onUpdateRole: (id: string, role: Role) => void;
  onDeactivate: (id: string) => void;
  onResetPassword: (id: string, newPassword: string) => void;
};

export default function UsersTable({
  users,
  currentUserEmail,
  onUpdateRole,
  onDeactivate,
  onResetPassword,
}: UsersTableProps) {
  const { has, role: actorRole } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editRole, setEditRole] = useState<Role>("EDITOR");

  const [deactivateTarget, setDeactivateTarget] = useState<UserRow | null>(null);

  const [resetUser, setResetUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const canAssign = has("roles:assign");
  const canDeactivate = has("users:deactivate");
  const canResetPw = has("password:reset");

  // Roles the actor can assign — exclude SUPER_ADMIN from targets
  const assignableRoles = actorRole
    ? getAssignableRoles(actorRole).filter((r) => r !== "SUPER_ADMIN")
    : [];

  const total = users.length;
  const start = (page - 1) * pageSize;
  const pageData = users.slice(start, start + pageSize);

  function openEditRole(user: UserRow) {
    setEditUser(user);
    // Default to the user's current role if assignable, else first option
    const current = user.role as Role;
    setEditRole((assignableRoles as Role[]).includes(current) ? current : assignableRoles[0] ?? "EDITOR");
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (editUser) {
      onUpdateRole(editUser.id, editRole);
    }
    setEditUser(null);
  }

  function openResetPassword(user: UserRow) {
    setResetUser(user);
    setNewPassword("");
  }

  function handleResetSubmit(e: FormEvent) {
    e.preventDefault();
    if (resetUser && newPassword.length >= 8) {
      onResetPassword(resetUser.id, newPassword);
    }
    setResetUser(null);
    setNewPassword("");
  }

  const columns: Column<UserRow>[] = [
    { key: "fullName", header: "Name", render: (r) => r.fullName },
    { key: "email", header: "Email", render: (r) => r.email },
    { key: "role", header: "Role", render: (r) => r.role },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.isActive ? "success" : "neutral"}>
          {r.isActive ? "active" : "inactive"}
        </Badge>
      ),
    },
    { key: "createdAt", header: "Created", render: (r) => r.createdAt },
    {
      key: "actions",
      header: "",
      render: (r) => {
        const isSelf = r.email === currentUserEmail;
        const targetRole = r.role as Role;
        const canManageThis = actorRole ? canManageRole(actorRole, targetRole) : false;

        return (
          <div className="flex gap-2">
            {canAssign && r.isActive && canManageThis && targetRole !== "SUPER_ADMIN" && (
              <Button variant="ghost" size="sm" onClick={() => openEditRole(r)}>
                Edit Role
              </Button>
            )}
            {canDeactivate && r.isActive && !isSelf && targetRole !== "SUPER_ADMIN" && (
              <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(r)}>
                Deactivate
              </Button>
            )}
            {canResetPw && targetRole !== "SUPER_ADMIN" && (
              <Button variant="ghost" size="sm" onClick={() => openResetPassword(r)}>
                Reset Password
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={pageData}
        rowKey={(r) => r.id}
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        emptyTitle="No users yet"
        emptyMessage="Add a user to get started."
      />

      {/* Edit Role modal */}
      <Modal open={editUser !== null} onClose={() => setEditUser(null)}>
        {editUser && (
          <form onSubmit={handleEditSubmit} className="px-6 py-5 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Edit Role — {editUser.fullName}
            </h3>
            <div className="space-y-1.5">
              <label
                htmlFor="edit-role"
                className="block text-sm font-medium text-gray-700"
              >
                Role
              </label>
              <select
                id="edit-role"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as Role)}
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditUser(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset Password modal */}
      <Modal open={resetUser !== null} onClose={() => setResetUser(null)}>
        {resetUser && (
          <form onSubmit={handleResetSubmit} className="px-6 py-5 space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Reset Password — {resetUser.fullName}
            </h3>
            <Input
              label="New Password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              error={newPassword.length > 0 && newPassword.length < 8 ? "Must be at least 8 characters." : undefined}
            />
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setResetUser(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={newPassword.length < 8}>
                Reset
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Deactivate confirm dialog */}
      <ConfirmDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) onDeactivate(deactivateTarget.id);
        }}
        title="Deactivate user"
        message={`Are you sure you want to deactivate "${deactivateTarget?.fullName ?? ""}"?`}
        confirmLabel="Deactivate"
      />
    </>
  );
}
