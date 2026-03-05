import type { DocumentType } from "@prisma/client";

export type CreateFormulationBody = {
  skuId: string;
};

export type CreateVersionBody = Record<string, never>;

export type AddIngredientBody = {
  ingredientName: string;
  function: string;
  concentrationPct: number;
};

export type AddDocumentBody = {
  type: DocumentType;
  fileName: string;
  url: string;
};

export type RejectVersionBody = {
  reason: string;
};
