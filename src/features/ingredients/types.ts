export type Ingredient = {
  id: string;
  inciName: string;
  casNumber: string | null;
  synonyms: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateIngredientPayload = {
  inciName: string;
  casNumber?: string | null;
  synonyms?: string[];
};

export type UpdateIngredientPayload = {
  inciName?: string;
  casNumber?: string | null;
  synonyms?: string[];
};
