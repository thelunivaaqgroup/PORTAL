import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useAuditLogs(params?: {
  from?: string;
  to?: string;
  actorUserId?: string;
  entityType?: string;
  action?: string;
  limit?: number;
  cursor?: string;
}) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => api.audit.list(params),
  });
}
