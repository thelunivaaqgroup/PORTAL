import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useProductDocuments(productId: string) {
  return useQuery({
    queryKey: ["productDocuments", productId],
    queryFn: () => api.documents.list(productId),
    enabled: !!productId,
  });
}

export function useUploadDocument(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.documents.upload(productId, formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productDocuments", productId] });
      qc.invalidateQueries({ queryKey: ["products", productId] });
    },
  });
}

export function useDocumentDownloadUrl(productId: string, docId: string) {
  return api.documents.downloadUrl(productId, docId);
}
