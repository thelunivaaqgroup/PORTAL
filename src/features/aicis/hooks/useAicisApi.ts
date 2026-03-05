import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";

export function useAicisActive(regionCode = "AU") {
  return useQuery({
    queryKey: ["aicis-active", regionCode],
    queryFn: () => api.aicis.getActive(regionCode),
  });
}

export function useAicisImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.aicis.importSnapshot(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aicis-active"] });
    },
  });
}

export function useAicisScrutiny(uploadId: string | undefined, region = "AU") {
  return useQuery({
    queryKey: ["aicis-scrutiny", uploadId, region],
    queryFn: () => api.aicis.getLatestScrutiny(uploadId!, region),
    enabled: !!uploadId,
    retry: false,
  });
}

export function useRunAicisScrutiny(uploadId: string | undefined, region = "AU") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.aicis.runScrutiny(uploadId!, region),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["aicis-scrutiny", uploadId, region] });
    },
  });
}

export function useAicisChemical(chemicalId: string | undefined) {
  return useQuery({
    queryKey: ["aicis-chemical", chemicalId],
    queryFn: () => api.aicis.getChemical(chemicalId!),
    enabled: !!chemicalId,
  });
}

// ── Banned / Restricted hooks ──

export function useBannedRestrictedLatest() {
  return useQuery({
    queryKey: ["banned-restricted-latest"],
    queryFn: () => api.bannedRestricted.getLatestSnapshot(),
  });
}

export function useBannedRestrictedSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.bannedRestricted.sync(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banned-restricted-latest"] });
      qc.invalidateQueries({ queryKey: ["banned-restricted-evaluate"] });
    },
  });
}

export function useBannedRestrictedImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.bannedRestricted.importArtifacts(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banned-restricted-latest"] });
      qc.invalidateQueries({ queryKey: ["banned-restricted-evaluate"] });
    },
  });
}

export function useBannedRestrictedIngestOffline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (formData: FormData) => api.bannedRestricted.ingestOffline(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["banned-restricted-latest"] });
      qc.invalidateQueries({ queryKey: ["banned-restricted-evaluate"] });
    },
  });
}

export function useBannedRestrictedEvaluation(uploadId: string | undefined) {
  return useQuery({
    queryKey: ["banned-restricted-evaluate", uploadId],
    queryFn: () => api.bannedRestricted.evaluateUpload(uploadId!),
    enabled: !!uploadId,
    retry: false,
  });
}

export function useBannedRestrictedSnapshot(snapshotId: string | undefined) {
  return useQuery({
    queryKey: ["banned-restricted-snapshot", snapshotId],
    queryFn: () => api.bannedRestricted.getSnapshotById(snapshotId!),
    enabled: !!snapshotId,
  });
}

export function useBannedRestrictedChemical(chemicalId: string | undefined) {
  return useQuery({
    queryKey: ["banned-restricted-chemical", chemicalId],
    queryFn: () => api.bannedRestricted.getChemicalById(chemicalId!),
    enabled: !!chemicalId,
  });
}
