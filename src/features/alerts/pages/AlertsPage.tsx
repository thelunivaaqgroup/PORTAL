import { useState } from "react";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import DataTable from "../../../components/DataTable";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";
import { useAlertsQuery, useRunAlerts, useResolveAlert } from "../hooks/useAlertsApi";
import type { AlertType, AlertStatus, SystemAlert } from "../types";
import { ALERT_TYPE_LABELS } from "../types";
import type { Column } from "../../../components/DataTable";

const ALERT_TYPE_VARIANTS: Record<AlertType, "error" | "warning" | "neutral"> = {
  LOW_STOCK: "warning",
  LOT_EXPIRING_SOON: "warning",
  LOT_EXPIRED: "error",
  DOC_EXPIRING_SOON: "warning",
  DOC_EXPIRED: "error",
};

const ALL_TYPES: AlertType[] = [
  "LOW_STOCK",
  "LOT_EXPIRING_SOON",
  "LOT_EXPIRED",
  "DOC_EXPIRING_SOON",
  "DOC_EXPIRED",
];

export default function AlertsPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<AlertStatus | "">("ACTIVE");
  const [typeFilter, setTypeFilter] = useState<AlertType | "">("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const filters = {
    ...(statusFilter && { status: statusFilter as AlertStatus }),
    ...(typeFilter && { type: typeFilter as AlertType }),
  };

  const { data, isLoading } = useAlertsQuery(
    Object.keys(filters).length > 0 ? filters : undefined,
  );
  const runMutation = useRunAlerts();
  const resolveMutation = useResolveAlert();

  const alerts = data?.alerts ?? [];

  function handleRun() {
    runMutation.mutate(undefined, {
      onSuccess: () => toast("success", "Alert checks completed."),
      onError: (err) => toast("error", err instanceof Error ? err.message : "Sweep failed"),
    });
  }

  function handleResolve(id: string) {
    resolveMutation.mutate(id, {
      onSuccess: () => toast("success", "Alert resolved."),
      onError: (err) => toast("error", err instanceof Error ? err.message : "Resolve failed"),
    });
  }

  const selectCls =
    "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  const columns: Column<SystemAlert>[] = [
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge variant={ALERT_TYPE_VARIANTS[r.type]}>
          {ALERT_TYPE_LABELS[r.type]}
        </Badge>
      ),
    },
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "message", header: "Message", render: (r) => r.message },
    {
      key: "context",
      header: "Context",
      render: (r) => {
        if (r.ingredient) return r.ingredient.inciName;
        if (r.product) return `${r.product.name} (${r.product.skuCode})`;
        return "—";
      },
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (r) => new Date(r.updatedAt).toLocaleString(),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={r.status === "ACTIVE" ? "warning" : "success"}>
          {r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (r) =>
        r.status === "ACTIVE" ? (
          <Can permission="manufacturing:approve">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleResolve(r.id)}
              disabled={resolveMutation.isPending}
            >
              Resolve
            </Button>
          </Can>
        ) : (
          <span className="text-xs text-gray-500">
            {r.resolvedBy?.fullName ?? "—"}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Alerts"
        subtitle={`${alerts.length} alert(s)`}
        action={
          <Can permission="manufacturing:approve">
            <Button
              size="sm"
              onClick={handleRun}
              disabled={runMutation.isPending}
            >
              {runMutation.isPending ? "Running..." : "Run Checks"}
            </Button>
          </Can>
        }
      />

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as AlertStatus | ""); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="RESOLVED">Resolved</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as AlertType | ""); setPage(1); }}
          className={selectCls}
        >
          <option value="">All Types</option>
          {ALL_TYPES.map((t) => (
            <option key={t} value={t}>{ALERT_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={alerts.slice((page - 1) * pageSize, page * pageSize)}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No alerts"
        emptyMessage="Run checks to scan for inventory and document alerts."
        page={page}
        pageSize={pageSize}
        total={alerts.length}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
      />
    </div>
  );
}
