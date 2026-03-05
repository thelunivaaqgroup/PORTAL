export type GreenfieldStatus = "DRAFT" | "READY_TO_CONVERT" | "CONVERTED" | "ARCHIVED";

export type GreenfieldIdea = {
  id: string;
  title: string;
  conceptNotes: string | null;
  targetAudience: string | null;
  ingredientsVision: string | null;
  marketPositioning: string | null;
  additionalNotes: string | null;
  status: GreenfieldStatus;
  convertedProductId: string | null;
  convertedProduct: { id: string; name: string; skuCode: string } | null;
  createdBy: { id: string; fullName: string; email: string };
  createdAt: string;
  updatedAt: string;
};

export type CreateGreenfieldPayload = {
  title: string;
  conceptNotes?: string;
  targetAudience?: string;
  ingredientsVision?: string;
  marketPositioning?: string;
  additionalNotes?: string;
};

export type UpdateGreenfieldPayload = {
  title?: string;
  conceptNotes?: string | null;
  targetAudience?: string | null;
  ingredientsVision?: string | null;
  marketPositioning?: string | null;
  additionalNotes?: string | null;
};

export type ConvertGreenfieldPayload = {
  productName: string;
  rangeId: string;
  brand?: string;
};

export const STATUS_LABELS: Record<GreenfieldStatus, string> = {
  DRAFT: "Draft",
  READY_TO_CONVERT: "Ready",
  CONVERTED: "Converted",
  ARCHIVED: "Archived",
};

export const STATUS_COLORS: Record<GreenfieldStatus, "neutral" | "warning" | "success" | "error"> = {
  DRAFT: "neutral",
  READY_TO_CONVERT: "warning",
  CONVERTED: "success",
  ARCHIVED: "error",
};
