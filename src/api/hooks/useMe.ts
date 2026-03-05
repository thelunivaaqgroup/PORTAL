import { useQuery } from "@tanstack/react-query";
import { api } from "../client";
import type { User } from "../auth.types";

export function useMeQuery(enabled = true) {
  return useQuery<User>({
    queryKey: ["auth", "me"],
    queryFn: () => api.auth.me(),
    enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });
}
