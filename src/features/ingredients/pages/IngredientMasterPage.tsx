import { useState, useMemo } from "react";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import DataTable, { type Column } from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Can from "../../../components/Can";
import ConfirmDialog from "../../../components/ConfirmDialog";
import PageError from "../../../components/PageError";
import { useToast } from "../../../context/useToast";
import {
  useIngredientsQuery,
  useCreateIngredient,
  useUpdateIngredient,
  useDeleteIngredient,
} from "../hooks/useIngredientsApi";
import IngredientModal from "../components/IngredientModal";
import type { Ingredient } from "../types";

export default function IngredientMasterPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useIngredientsQuery();
  const createMutation = useCreateIngredient();
  const updateMutation = useUpdateIngredient();
  const deleteMutation = useDeleteIngredient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<Ingredient | null>(null);
  const [deleteItem, setDeleteItem] = useState<Ingredient | null>(null);

  const filtered = useMemo(() => {
    const ingredients = data?.ingredients ?? [];
    if (!search.trim()) return ingredients;
    const q = search.toLowerCase();
    return ingredients.filter(
      (i) =>
        i.inciName.toLowerCase().includes(q) ||
        (i.casNumber && i.casNumber.toLowerCase().includes(q)) ||
        i.synonyms.some((s) => s.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const total = filtered.length;
  const pageData = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleCreate(data: { inciName: string; casNumber: string | null; synonyms: string[] }) {
    createMutation.mutate(
      { inciName: data.inciName, casNumber: data.casNumber, synonyms: data.synonyms },
      {
        onSuccess: () => {
          toast("success", `Ingredient "${data.inciName}" created`);
          setCreateOpen(false);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Create failed"),
      },
    );
  }

  function handleUpdate(data: { inciName: string; casNumber: string | null; synonyms: string[] }) {
    if (!editItem) return;
    updateMutation.mutate(
      { id: editItem.id, body: { inciName: data.inciName, casNumber: data.casNumber, synonyms: data.synonyms } },
      {
        onSuccess: () => {
          toast("success", `Ingredient "${data.inciName}" updated`);
          setEditItem(null);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Update failed"),
      },
    );
  }

  function handleDelete() {
    if (!deleteItem) return;
    deleteMutation.mutate(deleteItem.id, {
      onSuccess: () => {
        toast("success", `Ingredient "${deleteItem.inciName}" deleted`);
        setDeleteItem(null);
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Delete failed"),
    });
  }

  const columns: Column<Ingredient>[] = [
    {
      key: "inciName",
      header: "INCI Name",
      render: (r) => <span className="font-medium text-gray-900">{r.inciName}</span>,
    },
    {
      key: "casNumber",
      header: "CAS",
      render: (r) => r.casNumber || <span className="text-gray-400">—</span>,
    },
    {
      key: "synonyms",
      header: "Synonyms",
      render: (r) => {
        if (r.synonyms.length === 0) return <span className="text-gray-400">—</span>;
        const shown = r.synonyms.slice(0, 3).join(", ");
        const extra = r.synonyms.length - 3;
        return (
          <span title={r.synonyms.join(", ")}>
            {shown}
            {extra > 0 && (
              <Badge className="ml-1.5">+{extra}</Badge>
            )}
          </span>
        );
      },
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (r) => new Date(r.updatedAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-2 justify-end">
          <Can permission="ingredients:write">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditItem(r)}
            >
              Edit
            </Button>
          </Can>
          <Can permission="ingredients:delete">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteItem(r)}
            >
              Delete
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  if (isError) {
    return <PageError message="Failed to load ingredients" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ingredient Master"
        subtitle="Manage INCI ingredients, CAS numbers, and synonyms"
        action={
          <Can permission="ingredients:write">
            <Button onClick={() => setCreateOpen(true)}>Add Ingredient</Button>
          </Can>
        }
      />

      <div>
        <input
          type="text"
          placeholder="Search by INCI name, CAS, or synonym..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="block w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <DataTable
        columns={columns}
        data={pageData}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No ingredients"
        emptyMessage="Add your first ingredient to get started."
        emptyAction={
          <Can permission="ingredients:write">
            <Button size="sm" onClick={() => setCreateOpen(true)}>Add Ingredient</Button>
          </Can>
        }
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      {/* Create modal */}
      <IngredientModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={handleCreate}
        loading={createMutation.isPending}
      />

      {/* Edit modal */}
      <IngredientModal
        open={!!editItem}
        onClose={() => setEditItem(null)}
        onSubmit={handleUpdate}
        loading={updateMutation.isPending}
        ingredient={editItem}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        title="Delete Ingredient"
        message={`Are you sure you want to delete "${deleteItem?.inciName}"? This action cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
