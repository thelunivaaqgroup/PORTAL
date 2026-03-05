import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useRanges, useCreateRange, useDeleteRange, useUpdateRange } from "../hooks/useProductsApi";
import type { ProductRange } from "../types";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import Can from "../../../components/Can";
import PageError from "../../../components/PageError";
import EmptyState from "../../../components/EmptyState";
import { SkeletonLine } from "../../../components/Skeleton";
import { useToast } from "../../../context/useToast";

export default function ProductsListPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useRanges();
  const createMutation = useCreateRange();
  const deleteMutation = useDeleteRange();
  const updateMutation = useUpdateRange();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [editRange, setEditRange] = useState<ProductRange | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRange | null>(null);

  const ranges = data?.ranges ?? [];

  if (isError) {
    return <PageError message="Failed to load product ranges" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products"
        subtitle="Manage product ranges and formulation lifecycle"
        action={
          <Can permission="ranges:write">
            <Button onClick={() => setNewFolderOpen(true)}>New Folder</Button>
          </Can>
        }
      />

      {isLoading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Folder Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Products</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Updated</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Array.from({ length: 3 }, (_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3"><SkeletonLine className="w-2/3" /></td>
                  <td className="px-4 py-3"><SkeletonLine className="w-12" /></td>
                  <td className="px-4 py-3"><SkeletonLine className="w-24" /></td>
                  <td className="px-4 py-3"><SkeletonLine className="w-20" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : ranges.length === 0 ? (
        <EmptyState
          title="No product ranges"
          message="Create your first product range (folder) to get started."
          action={
            <Can permission="ranges:write">
              <Button size="sm" onClick={() => setNewFolderOpen(true)}>New Folder</Button>
            </Can>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Folder Name</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Products</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Updated</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {ranges.map((range) => (
                <tr key={range.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/products/range/${range.id}`}
                      className="flex items-center gap-2 font-medium text-blue-600 hover:text-blue-800"
                    >
                      <span className="text-gray-400">📁</span>
                      {range.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="neutral">{range._count.products}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {new Date(range.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link to={`/products/range/${range.id}`}>
                        <Button size="sm" variant="secondary">Open</Button>
                      </Link>
                      <Can permission="ranges:write">
                        <Button size="sm" variant="secondary" onClick={() => setEditRange(range)}>
                          Edit
                        </Button>
                      </Can>
                      <Can permission="ranges:delete">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={range._count.products > 0}
                          onClick={() => setDeleteTarget(range)}
                        >
                          Delete
                        </Button>
                      </Can>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Folder Modal */}
      <NewFolderModal
        open={newFolderOpen}
        loading={createMutation.isPending}
        onClose={() => setNewFolderOpen(false)}
        onSubmit={(name) => {
          createMutation.mutate(name, {
            onSuccess: (res) => {
              toast("success", `Folder "${res.range.name}" created`);
              setNewFolderOpen(false);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Create failed"),
          });
        }}
      />

      {/* Edit Folder Modal */}
      <EditFolderModal
        range={editRange}
        loading={updateMutation.isPending}
        onClose={() => setEditRange(null)}
        onSubmit={(id, name) => {
          updateMutation.mutate({ id, name }, {
            onSuccess: () => {
              toast("success", "Folder renamed");
              setEditRange(null);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Update failed"),
          });
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteFolderModal
        range={deleteTarget}
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(id) => {
          deleteMutation.mutate(id, {
            onSuccess: () => {
              toast("success", "Folder deleted");
              setDeleteTarget(null);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Delete failed"),
          });
        }}
      />
    </div>
  );
}

// ── New Folder Modal ──

function NewFolderModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Folder name is required");
      return;
    }
    setNameError("");
    onSubmit(name.trim());
  }

  function handleClose() {
    setName("");
    setNameError("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      {open && (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">New Folder (Range)</h3>
          <Input
            label="Folder Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            placeholder="e.g. Aloe Vera Range"
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Creating..." : "Create Folder"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ── Edit Folder Modal ──

function EditFolderModal({
  range,
  loading,
  onClose,
  onSubmit,
}: {
  range: ProductRange | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (id: string, name: string) => void;
}) {
  return (
    <Modal open={!!range} onClose={onClose}>
      {range && (
        <EditFolderForm range={range} loading={loading} onClose={onClose} onSubmit={onSubmit} />
      )}
    </Modal>
  );
}

function EditFolderForm({
  range,
  loading,
  onClose,
  onSubmit,
}: {
  range: ProductRange;
  loading: boolean;
  onClose: () => void;
  onSubmit: (id: string, name: string) => void;
}) {
  const [name, setName] = useState(range.name);
  const [nameError, setNameError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError("Folder name is required");
      return;
    }
    setNameError("");
    onSubmit(range.id, name.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Rename Folder</h3>
      <Input
        label="Folder Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        placeholder="e.g. Aloe Vera Range"
      />
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Delete Confirmation Modal ──

function DeleteFolderModal({
  range,
  loading,
  onClose,
  onConfirm,
}: {
  range: ProductRange | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  return (
    <Modal open={!!range} onClose={onClose}>
      {range && (
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Delete Folder</h3>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{range.name}</strong>? This cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => onConfirm(range.id)}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
