import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { SaveIdeationPayload } from "../types";

export function useIdeationLatest(productId: string) {
  return useQuery({
    queryKey: ["products", productId, "ideation", "latest"],
    queryFn: () => api.ideation.latest(productId),
    enabled: !!productId,
  });
}

export function useIdeationVersions(productId: string) {
  return useQuery({
    queryKey: ["products", productId, "ideation", "versions"],
    queryFn: () => api.ideation.list(productId),
    enabled: !!productId,
  });
}

export function useSaveIdeation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveIdeationPayload) =>
      api.ideation.save(productId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId, "ideation", "latest"] });
      qc.invalidateQueries({ queryKey: ["products", productId, "ideation", "versions"] });
    },
  });
}

export function useActivateIdeation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ideationId: string) =>
      api.ideation.activate(productId, ideationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId, "ideation", "latest"] });
      qc.invalidateQueries({ queryKey: ["products", productId, "ideation", "versions"] });
    },
  });
}
