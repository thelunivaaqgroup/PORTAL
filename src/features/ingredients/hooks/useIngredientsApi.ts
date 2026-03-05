import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client";
import type { CreateIngredientPayload, UpdateIngredientPayload } from "../types";

export function useIngredientsQuery() {
  return useQuery({
    queryKey: ["ingredients"],
    queryFn: () => api.ingredients.list(),
  });
}

export function useCreateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIngredientPayload) => api.ingredients.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  });
}

export function useUpdateIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateIngredientPayload }) =>
      api.ingredients.update(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  });
}

export function useDeleteIngredient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.ingredients.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ingredients"] }),
  });
}
