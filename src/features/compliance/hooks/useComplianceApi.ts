import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { ResolvePayload } from "../types";

export function useComplianceRequestLatest(productId: string | undefined) {
  return useQuery({
    queryKey: ["compliance-request-latest", productId],
    queryFn: () => api.complianceRequests.getLatestForProduct(productId!),
    enabled: !!productId,
    retry: false,
  });
}

export function useComplianceRequest(requestId: string | undefined) {
  return useQuery({
    queryKey: ["compliance-request", requestId],
    queryFn: () => api.complianceRequests.getById(requestId!),
    enabled: !!requestId,
  });
}

export function useCreateComplianceRequest(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regionScope?: string[]) =>
      api.complianceRequests.createForProduct(productId, regionScope),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-request-latest", productId] });
    },
  });
}

export function useCheckEligibility(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) =>
      api.complianceRequests.checkEligibility(requestId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-request-latest", productId] });
    },
  });
}

export function useApproveComplianceRequest(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      comment,
    }: {
      requestId: string;
      comment?: string;
    }) => api.complianceRequests.approve(requestId, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compliance-request-latest", productId] });
    },
  });
}

export function useComplianceArtifacts(requestId: string | undefined) {
  return useQuery({
    queryKey: ["compliance-artifacts", requestId],
    queryFn: () => api.complianceRequests.getArtifacts(requestId!),
    enabled: !!requestId,
  });
}

// ── Ingredient Resolution hooks ──

export function useUnmatchedRows(requestId: string | undefined) {
  return useQuery({
    queryKey: ["unmatched-rows", requestId],
    queryFn: () => api.ingredients.getUnmatched(requestId!),
    enabled: !!requestId,
    retry: false,
  });
}

export function useIngredientSearch(query: string, limit = 8) {
  return useQuery({
    queryKey: ["ingredient-search", query, limit],
    queryFn: ({ signal }) => {
      void signal; // React Query passes AbortSignal; unused by generic fetcher but kept for future
      return api.ingredients.search(query, limit);
    },
    enabled: query.length >= 2,
    staleTime: 30_000,
  });
}

export function useResolveIngredient(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ResolvePayload) => api.ingredients.resolve(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unmatched-rows"] });
      qc.invalidateQueries({ queryKey: ["compliance-request-latest", productId] });
    },
  });
}

export function useUploadEvidence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ uploadRowId, file, docType }: { uploadRowId: string; file: File; docType: string }) =>
      api.ingredients.uploadEvidence(uploadRowId, file, docType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unmatched-rows"] });
    },
  });
}

export function useAutoResolve(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, limit }: { requestId: string; limit?: number }) =>
      api.ingredients.autoResolve(productId, requestId, limit),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["unmatched-rows"] });
      qc.invalidateQueries({ queryKey: ["compliance-request-latest", productId] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}
