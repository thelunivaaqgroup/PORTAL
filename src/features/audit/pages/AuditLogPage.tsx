import { useState } from "react";
import PageHeader from "../../../components/PageHeader";
import { Card, CardBody } from "../../../components/Card";
import Button from "../../../components/Button";
import { useAuditLogs } from "../hooks/useAuditApi";
import { SkeletonLine } from "../../../components/Skeleton";
import PageError from "../../../components/PageError";

export default function AuditLogPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const params: Parameters<typeof useAuditLogs>[0] = {
    limit: 50,
    ...(from && { from }),
    ...(to && { to }),
    ...(actionFilter && { action: actionFilter }),
    ...(entityFilter && { entityType: entityFilter }),
    ...(cursor && { cursor }),
  };

  const { data, isLoading, isError, error, refetch } = useAuditLogs(params);
  const logs = data?.logs ?? [];
  const hasMore = data?.hasMore ?? false;
  const nextCursor = data?.nextCursor ?? null;

  if (isError) {
    return (
      <PageError
        title="Failed to load audit log"
        message={error instanceof Error ? error.message : "An error occurred"}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        subtitle="System activity for compliance and inspection"
      />

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">From date</span>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setCursor(undefined);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">To date</span>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setCursor(undefined);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Action</span>
              <input
                type="text"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value.trim());
                  setCursor(undefined);
                }}
                placeholder="e.g. COMPLIANCE_REQUEST_APPROVED"
                className="rounded border border-gray-300 px-2 py-1 text-sm w-56"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">Entity type</span>
              <input
                type="text"
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value.trim());
                  setCursor(undefined);
                }}
                placeholder="e.g. product, compliance_request"
                className="rounded border border-gray-300 px-2 py-1 text-sm w-48"
              />
            </label>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setFrom("");
                setTo("");
                setActionFilter("");
                setEntityFilter("");
                setCursor(undefined);
              }}
            >
              Clear filters
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonLine key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Time</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Actor</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Action</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Entity</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-gray-500">
                          No audit entries found.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                            {new Date(log.at).toLocaleString()}
                          </td>
                          <td className="py-1.5 px-2">
                            {log.actor
                              ? `${log.actor.fullName} (${log.actor.email})`
                              : "—"}
                          </td>
                          <td className="py-1.5 px-2 font-mono text-xs">{log.action}</td>
                          <td className="py-1.5 px-2">{log.entityType}</td>
                          <td className="py-1.5 px-2 font-mono text-xs truncate max-w-[120px]" title={log.entityId ?? ""}>
                            {log.entityId ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {hasMore && nextCursor && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCursor(nextCursor)}
                  >
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
