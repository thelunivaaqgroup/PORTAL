export type AlertType =
  | "LOW_STOCK"
  | "LOT_EXPIRING_SOON"
  | "LOT_EXPIRED"
  | "DOC_EXPIRING_SOON"
  | "DOC_EXPIRED"
  | "COMPLIANCE_FAILURE"
  | "STAGE_DELAY";

export type AlertStatus = "ACTIVE" | "RESOLVED";

export const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  LOW_STOCK: "Low Stock",
  LOT_EXPIRING_SOON: "Lot Expiring Soon",
  LOT_EXPIRED: "Lot Expired",
  DOC_EXPIRING_SOON: "Doc Expiring Soon",
  DOC_EXPIRED: "Doc Expired",
  COMPLIANCE_FAILURE: "Compliance Failure",
  STAGE_DELAY: "Stage Delay",
};

export type SystemAlert = {
  id: string;
  type: AlertType;
  status: AlertStatus;
  title: string;
  message: string;
  ingredientId: string | null;
  lotId: string | null;
  productId: string | null;
  documentId: string | null;
  dedupeKey: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  ingredient: { id: string; inciName: string } | null;
  lot: { id: string; supplierLotNumber: string } | null;
  product: { id: string; name: string; skuCode: string } | null;
  resolvedBy: { id: string; fullName: string } | null;
};
