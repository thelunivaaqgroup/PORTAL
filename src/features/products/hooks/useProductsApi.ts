import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { CreateProductPayload, UpdateProductPayload } from "../types";

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: () => api.products.list(),
  });
}

export function useProductsByRange(rangeId: string) {
  return useQuery({
    queryKey: ["products", "range", rangeId],
    queryFn: () => api.products.listByRange(rangeId),
    enabled: !!rangeId,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: () => api.products.getById(id),
    enabled: !!id,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductPayload) => api.products.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["ranges"] });
    },
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateProductPayload) => api.products.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products", id] });
      qc.invalidateQueries({ queryKey: ["ranges"] });
    },
  });
}

export function useQuickUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductPayload }) =>
      api.products.update(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products", vars.id] });
      qc.invalidateQueries({ queryKey: ["ranges"] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.products.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["ranges"] });
    },
  });
}

export function useUploadProductFormulation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.products.uploadFormulation(productId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}

export function useReplaceFormulation(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.products.replaceFormulation(productId, file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
      qc.invalidateQueries({ queryKey: ["formulation-history", productId] });
      qc.invalidateQueries({ queryKey: ["compliance-request"] });
    },
  });
}

export function useFormulationHistory(productId: string) {
  return useQuery({
    queryKey: ["formulation-history", productId],
    queryFn: () => api.products.getFormulationHistory(productId),
    enabled: !!productId,
  });
}

// ── Ranges (Folders) ──

export function useRanges() {
  return useQuery({
    queryKey: ["ranges"],
    queryFn: () => api.ranges.list(),
  });
}

export function useCreateRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.ranges.create(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ranges"] }),
  });
}

export function useUpdateRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.ranges.update(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ranges"] }),
  });
}

export function useDeleteRange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.ranges.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ranges"] }),
  });
}
