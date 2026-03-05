import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { RegionCode, SaveLabelPayload } from "../types";

export function useLabels(productId: string, region: RegionCode) {
  return useQuery({
    queryKey: ["labels", productId, region],
    queryFn: () => api.labels.list(productId, region),
    enabled: !!productId && !!region,
  });
}

export function useSaveLabel(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveLabelPayload) => api.labels.save(productId, body),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["labels", productId, variables.region] });
      qc.invalidateQueries({ queryKey: ["labelValidation", productId, variables.region] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}

export function useActivateLabel(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labelId: string) => api.labels.activate(productId, labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", productId] });
      qc.invalidateQueries({ queryKey: ["labelValidation", productId] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}

export function useLabelValidation(productId: string, region: RegionCode) {
  return useQuery({
    queryKey: ["labelValidation", productId, region],
    queryFn: () => api.labels.validate(productId, region),
    enabled: !!productId && !!region,
  });
}
