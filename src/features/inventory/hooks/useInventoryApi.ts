import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { CreateLotPayload, UpdateLotPayload } from "../types";

export function useLotsQuery() {
  return useQuery({
    queryKey: ["inventory", "lots"],
    queryFn: () => api.inventory.listLots(),
  });
}

export function useCreateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLotPayload) => api.inventory.createLot(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", "lots"] }),
  });
}

export function useUpdateLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateLotPayload }) =>
      api.inventory.updateLot(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", "lots"] }),
  });
}

export function useDeleteLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.inventory.deleteLot(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", "lots"] }),
  });
}

export function useBulkUploadLots() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.inventory.bulkUpload(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory", "lots"] }),
  });
}
