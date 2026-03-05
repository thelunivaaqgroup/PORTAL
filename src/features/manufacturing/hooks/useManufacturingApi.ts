import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useApproveManufacturing(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.manufacturing.approveManufacturing(productId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useMaxProducible(productId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["products", productId, "maxProducible"],
    queryFn: () => api.manufacturing.getMaxProducible(productId),
    enabled,
  });
}

export function useCreateBatch(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productionQuantityKg: number) =>
      api.manufacturing.createBatch(productId, productionQuantityKg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId] });
      qc.invalidateQueries({ queryKey: ["products", productId, "batches"] });
      qc.invalidateQueries({ queryKey: ["products", productId, "maxProducible"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["inventory", "lots"] });
    },
  });
}

export function useBatches(productId: string) {
  return useQuery({
    queryKey: ["products", productId, "batches"],
    queryFn: () => api.manufacturing.listBatches(productId),
    enabled: !!productId,
  });
}

export function useReleaseBatch(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      api.manufacturing.releaseBatch(productId, batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId, "batches"] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
