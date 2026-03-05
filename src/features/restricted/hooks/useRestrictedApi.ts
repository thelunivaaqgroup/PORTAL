import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useRestrictedActiveDataset() {
  return useQuery({
    queryKey: ["restricted-active-dataset"],
    queryFn: () => api.restricted.getActiveDataset(),
  });
}

export function useRestrictedDatasets() {
  return useQuery({
    queryKey: ["restricted-datasets"],
    queryFn: () => api.restricted.listDatasets(),
  });
}

export function useUploadRestrictedPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.restricted.uploadEvidencePack(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restricted-active-dataset"] });
      qc.invalidateQueries({ queryKey: ["restricted-datasets"] });
    },
  });
}

export function useArchiveRestrictedDataset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restricted.archiveDataset(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["restricted-active-dataset"] });
      qc.invalidateQueries({ queryKey: ["restricted-datasets"] });
    },
  });
}
