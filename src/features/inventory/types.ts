export type RawMaterialLotStatus = "AVAILABLE" | "BLOCKED" | "EXPIRED";

export type RawMaterialLot = {
  id: string;
  ingredientId: string;
  ingredient: { id: string; inciName: string };
  supplierName: string;
  supplierLotNumber: string;
  quantityReceivedKg: number;
  quantityRemainingKg: number;
  expiryDate: string | null;
  status: RawMaterialLotStatus;
  createdAt: string;
  createdBy: { id: string; fullName: string };
};

export type CreateLotPayload = {
  ingredientId: string;
  supplierName: string;
  supplierLotNumber: string;
  quantityReceivedKg: number;
  expiryDate?: string;
};

export type UpdateLotPayload = {
  supplierName?: string;
  supplierLotNumber?: string;
  expiryDate?: string | null;
  status?: "AVAILABLE" | "BLOCKED";
};

export type BulkUploadResult = {
  createdCount: number;
  failedCount: number;
  failures: { rowNumber: number; reason: string }[];
};
