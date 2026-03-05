import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { PackSpecPayload } from "../types";

export function useFinishedGoodsLots(productId: string) {
  return useQuery({
    queryKey: ["products", productId, "finishedGoods"],
    queryFn: () => api.finishedGoods.listLots(productId),
    enabled: !!productId,
  });
}

export function useFinishedGoodsSummary(productId: string) {
  return useQuery({
    queryKey: ["products", productId, "finishedGoods", "summary"],
    queryFn: () => api.finishedGoods.summary(productId),
    enabled: !!productId,
  });
}

export function useSetPackSpec(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PackSpecPayload) =>
      api.finishedGoods.setPackSpec(productId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCreateFinishedGoods(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) =>
      api.finishedGoods.createFromBatch(productId, batchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products", productId, "finishedGoods"] });
      qc.invalidateQueries({ queryKey: ["products", productId, "batches"] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}
