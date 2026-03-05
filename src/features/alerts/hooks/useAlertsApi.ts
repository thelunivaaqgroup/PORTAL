import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { AlertStatus, AlertType } from "../types";

export function useAlertsQuery(filters?: { status?: AlertStatus; type?: AlertType }) {
  return useQuery({
    queryKey: ["alerts", filters],
    queryFn: () => api.alerts.list(filters),
  });
}

export function useRunAlerts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.alerts.run(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.alerts.resolve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}
