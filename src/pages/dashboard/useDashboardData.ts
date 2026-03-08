import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

export function useDashboardData() {
  const products = useQuery({
    queryKey: ["dashboard", "products"],
    queryFn: () => api.products.list(),
    staleTime: 60_000,
  });

  const alerts = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () => api.alerts.list({ status: "ACTIVE" }),
    staleTime: 30_000,
  });

  const compliance = useQuery({
    queryKey: ["dashboard", "compliance"],
    queryFn: () => api.complianceRequests.list(),
    staleTime: 60_000,
  });

  const inventory = useQuery({
    queryKey: ["dashboard", "inventory"],
    queryFn: () => api.inventory.listLots(),
    staleTime: 60_000,
  });

  const audit = useQuery({
    queryKey: ["dashboard", "audit"],
    queryFn: () => api.audit.list({ limit: 10 }),
    staleTime: 30_000,
  });

  const isLoading =
    products.isLoading ||
    alerts.isLoading ||
    compliance.isLoading ||
    inventory.isLoading ||
    audit.isLoading;

  const isError =
    products.isError ||
    alerts.isError ||
    compliance.isError ||
    inventory.isError ||
    audit.isError;

  return {
    products: products.data?.products ?? [],
    alerts: alerts.data?.alerts ?? [],
    complianceRequests: compliance.data?.requests ?? [],
    lots: inventory.data?.lots ?? [],
    auditLogs: audit.data?.logs ?? [],
    isLoading,
    isError,
    refetch: () => {
      products.refetch();
      alerts.refetch();
      compliance.refetch();
      inventory.refetch();
      audit.refetch();
    },
  };
}
