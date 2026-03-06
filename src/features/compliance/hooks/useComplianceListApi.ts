import { useQuery } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useComplianceRequestsList(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ["compliance-requests-list", params],
    queryFn: () => api.complianceRequests.list(params),
  });
}
