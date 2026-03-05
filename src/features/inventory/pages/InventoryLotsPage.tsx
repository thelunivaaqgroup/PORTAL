import { useState, useMemo } from "react";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import DataTable from "../../../components/DataTable";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";
import { useLotsQuery, useCreateLot, useUpdateLot, useDeleteLot, useBulkUploadLots } from "../hooks/useInventoryApi";
import LotModal from "../components/LotModal";
import BulkUploadModal from "../components/BulkUploadModal";
import type { Column } from "../../../components/DataTable";
import type { RawMaterialLot, RawMaterialLotStatus, CreateLotPayload, UpdateLotPayload, BulkUploadResult } from "../types";

const STATUS_VARIANTS: Record<RawMaterialLotStatus, "success" | "warning" | "neutral"> = {
  AVAILABLE: "success",
  BLOCKED: "warning",
  EXPIRED: "neutral",
};

export default function InventoryLotsPage() {
  const { toast } = useToast();
  const { data, isLoading } = useLotsQuery();
  const createMutation = useCreateLot();
  const updateMutation = useUpdateLot();
  const deleteMutation = useDeleteLot();
  const bulkMutation = useBulkUploadLots();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [showCreate, setShowCreate] = useState(false);
  const [editLot, setEditLot] = useState<RawMaterialLot | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);

  const lots = data?.lots ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return lots;
    const q = search.toLowerCase();
    return lots.filter(
      (l) =>
        l.ingredient.inciName.toLowerCase().includes(q) ||
        l.supplierName.toLowerCase().includes(q) ||
        l.supplierLotNumber.toLowerCase().includes(q),
    );
  }, [lots, search]);

  function handleCreate(payload: CreateLotPayload) {
    createMutation.mutate(payload, {
      onSuccess: () => { toast("success", "Lot created."); setShowCreate(false); },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Failed"),
    });
  }

  function handleEdit(payload: UpdateLotPayload) {
    if (!editLot) return;
    updateMutation.mutate({ id: editLot.id, body: payload }, {
      onSuccess: () => { toast("success", "Lot updated."); setEditLot(null); },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Failed"),
    });
  }

  function handleDelete(id: string) {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast("success", "Lot deleted."); setDeletingId(null); },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Failed"),
    });
  }

  function handleBulkUpload(file: File) {
    bulkMutation.mutate(file, {
      onSuccess: (res) => {
        setBulkResult(res);
        toast("success", `${res.createdCount} lots created.`);
      },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Upload failed"),
    });
  }

  const columns: Column<RawMaterialLot>[] = [
    { key: "ingredient", header: "Ingredient", render: (r) => r.ingredient.inciName },
    { key: "supplier", header: "Supplier", render: (r) => r.supplierName },
    { key: "lotNumber", header: "Lot #", render: (r) => r.supplierLotNumber },
    {
      key: "received",
      header: "Received (kg)",
      render: (r) => r.quantityReceivedKg.toFixed(2),
    },
    {
      key: "remaining",
      header: "Remaining (kg)",
      render: (r) => (
        <span className={r.quantityRemainingKg === 0 ? "text-gray-400" : ""}>
          {r.quantityRemainingKg.toFixed(2)}
        </span>
      ),
    },
    {
      key: "expiry",
      header: "Expiry",
      render: (r) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString() : "—",
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge variant={STATUS_VARIANTS[r.status]}>{r.status}</Badge>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-1">
          <Can permission="inventory:write">
            <Button size="sm" variant="ghost" onClick={() => setEditLot(r)}>Edit</Button>
          </Can>
          <Can permission="inventory:delete">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDeletingId(r.id)}
              className="text-red-600 hover:text-red-800"
            >
              Delete
            </Button>
          </Can>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raw Material Inventory"
        subtitle={`${lots.length} lots`}
        action={
          <Can permission="inventory:write">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => { setBulkResult(null); setShowBulk(true); }}>
                Bulk Upload CSV
              </Button>
              <Button size="sm" onClick={() => setShowCreate(true)}>Add Lot</Button>
            </div>
          </Can>
        }
      />

      {/* Search */}
      <div className="max-w-sm">
        <input
          type="text"
          placeholder="Search ingredient, supplier, lot..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <DataTable
        columns={columns}
        data={filtered.slice((page - 1) * pageSize, page * pageSize)}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No lots"
        emptyMessage="Add raw material lots to track inventory."
        page={page}
        pageSize={pageSize}
        total={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />

      {/* Create modal */}
      {showCreate && (
        <LotModal
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreateSubmit={handleCreate}
          loading={createMutation.isPending}
        />
      )}

      {/* Edit modal */}
      {editLot && (
        <LotModal
          open={!!editLot}
          onClose={() => setEditLot(null)}
          onEditSubmit={handleEdit}
          loading={updateMutation.isPending}
          lot={editLot}
        />
      )}

      {/* Bulk upload modal */}
      {showBulk && (
        <BulkUploadModal
          open={showBulk}
          onClose={() => { setShowBulk(false); setBulkResult(null); }}
          onUpload={handleBulkUpload}
          loading={bulkMutation.isPending}
          result={bulkResult}
        />
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <DeleteConfirm
          loading={deleteMutation.isPending}
          onConfirm={() => handleDelete(deletingId)}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirm({ loading, onConfirm, onCancel }: { loading: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-lg space-y-4">
        <h3 className="text-lg font-semibold text-gray-900">Delete Lot</h3>
        <p className="text-sm text-gray-600">
          Are you sure? This can only be done if no stock has been consumed from this lot.
        </p>
        <div className="flex gap-2">
          <Button onClick={onConfirm} disabled={loading}>
            {loading ? "Deleting..." : "Delete"}
          </Button>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}
