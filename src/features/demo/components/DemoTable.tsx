import { useState } from "react";
import DataTable, { type Column } from "../../../components/DataTable";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import Modal from "../../../components/Modal";
import ConfirmDialog from "../../../components/ConfirmDialog";
import Can from "../../../components/Can";
import type { DemoItem } from "../types";

type DemoTableProps = {
  items: DemoItem[];
  onDelete: (id: string) => void;
};

export default function DemoTable({ items, onDelete }: DemoTableProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [viewItem, setViewItem] = useState<DemoItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<DemoItem | null>(null);

  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageData = items.slice(start, start + pageSize);

  const columns: Column<DemoItem>[] = [
    { key: "name", header: "Name", render: (r) => r.name },
    { key: "description", header: "Description", render: (r) => r.description },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "active" ? "success" : "neutral"}>
          {r.status}
        </Badge>
      ),
    },
    { key: "createdAt", header: "Created", render: (r) => r.createdAt },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex gap-2">
          <Can permission="demo:read">
            <Button variant="ghost" size="sm" onClick={() => setViewItem(r)}>
              View
            </Button>
          </Can>
          <Can permission="demo:delete">
            <Button variant="ghost" size="sm" onClick={() => setDeleteItem(r)}>
              Delete
            </Button>
          </Can>
        </div>
      ),
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
        emptyTitle="No items yet"
        emptyMessage="Create your first item to get started."
      />

      {/* View detail modal */}
      <Modal open={viewItem !== null} onClose={() => setViewItem(null)}>
        {viewItem && (
          <div className="px-6 py-5 space-y-3">
            <h3 className="text-lg font-semibold text-gray-900">
              {viewItem.name}
            </h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-medium text-gray-500">Description</dt>
                <dd className="text-gray-700">{viewItem.description}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Status</dt>
                <dd className="text-gray-700">{viewItem.status}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-500">Created</dt>
                <dd className="text-gray-700">{viewItem.createdAt}</dd>
              </div>
            </dl>
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setViewItem(null)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete confirm dialog */}
      <ConfirmDialog
        open={deleteItem !== null}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => {
          if (deleteItem) onDelete(deleteItem.id);
        }}
        title="Delete item"
        message={`Are you sure you want to delete "${deleteItem?.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </>
  );
}
