export type IngredientDTO = {
  id: string;
  inciName: string;
  casNumber: string | null;
  synonyms: string[];
  createdAt: string;
  updatedAt: string;
};

export type CreateIngredientBody = {
  inciName: string;
  casNumber?: string | null;
  synonyms?: string[];
};

export type UpdateIngredientBody = {
  inciName?: string;
  casNumber?: string | null;
  synonyms?: string[];
};
