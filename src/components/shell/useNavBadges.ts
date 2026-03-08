import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client";

type NavBadges = {
  activeAlerts: number;
};

export function useNavBadges(): NavBadges {
  const { data } = useQuery({
    queryKey: ["nav-badges", "alerts"],
    queryFn: () => api.alerts.list({ status: "ACTIVE" }),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  return {
    activeAlerts: data?.alerts?.length ?? 0,
  };
}
