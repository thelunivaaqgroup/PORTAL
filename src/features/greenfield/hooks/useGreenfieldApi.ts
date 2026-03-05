import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { CreateGreenfieldPayload, UpdateGreenfieldPayload, ConvertGreenfieldPayload } from "../types";

export function useGreenfieldIdeas() {
  return useQuery({
    queryKey: ["greenfield"],
    queryFn: () => api.greenfield.list(),
  });
}

export function useGreenfieldIdea(id: string) {
  return useQuery({
    queryKey: ["greenfield", id],
    queryFn: () => api.greenfield.getById(id),
    enabled: !!id,
  });
}

export function useCreateGreenfield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGreenfieldPayload) => api.greenfield.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["greenfield"] }),
  });
}

export function useUpdateGreenfield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateGreenfieldPayload }) =>
      api.greenfield.update(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["greenfield"] });
      qc.invalidateQueries({ queryKey: ["greenfield", vars.id] });
    },
  });
}

export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.greenfield.markReady(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["greenfield"] });
      qc.invalidateQueries({ queryKey: ["greenfield", id] });
    },
  });
}

export function useConvertGreenfield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ConvertGreenfieldPayload }) =>
      api.greenfield.convert(id, body),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["greenfield"] });
      qc.invalidateQueries({ queryKey: ["greenfield", vars.id] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["ranges"] });
    },
  });
}

export function useArchiveGreenfield() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.greenfield.archive(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["greenfield"] });
      qc.invalidateQueries({ queryKey: ["greenfield", id] });
    },
  });
}
