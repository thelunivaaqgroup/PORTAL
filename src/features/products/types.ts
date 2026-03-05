export type ProductSku = {
  id: string;
  skuCode: string;
  productName: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductStage =
  | "PRE_LIFECYCLE"
  | "IDEA"
  | "R_AND_D"
  | "COMPLIANCE_READY"
  | "PACKAGING_READY"
  | "MANUFACTURING_APPROVED"
  | "BATCH_CREATED"
  | "BATCH_RELEASED"
  | "READY_FOR_SALE"
  | "LIVE"
  | "DISCONTINUED";

export const STAGE_LABELS: Record<ProductStage, string> = {
  PRE_LIFECYCLE: "Pre-Lifecycle",
  IDEA: "Idea",
  R_AND_D: "R&D",
  COMPLIANCE_READY: "Compliance Ready",
  PACKAGING_READY: "Packaging Ready",
  MANUFACTURING_APPROVED: "Manufacturing Approved",
  BATCH_CREATED: "Batch Created",
  BATCH_RELEASED: "Batch Released",
  READY_FOR_SALE: "Ready for Sale",
  LIVE: "Live",
  DISCONTINUED: "Discontinued",
};

export type ProductStageEvent = {
  id: string;
  productId: string;
  fromStage: ProductStage;
  toStage: ProductStage;
  reason: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string };
};

export type Product = {
  id: string;
  name: string;
  productLine: string | null;
  brand: string | null;
  skuCode: string;
  stage: ProductStage;
  targetRegions: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; email: string };
  packNetContentMl: number | null;
  fillDensityGPerMl: number;
  activeFormulationId: string | null;
  latestUploadId: string | null;
  hasDatasheetUpload: boolean;
  activeFormulation: {
    id: string;
    skuId: string;
    sku: { skuCode: string; productName: string };
    uploads?: {
      id: string;
      fileName: string;
      createdAt: string;
      rows?: { id: string; rawName: string }[];
    }[];
  } | null;
  latestUpload: {
    id: string;
    fileName: string;
    createdAt: string;
    rows?: FormulationUploadRow[];
    complianceSnapshots?: { id: string; region: string; status: string }[];
  } | null;
  rangeId: string;
  range: { id: string; name: string };
  stageEvents?: ProductStageEvent[];
};

// ── Upload types (moved from formulations) ──

export type MatchType = "EXACT" | "CAS" | "SYNONYM" | "MANUAL" | null;

export type FormulationUploadRow = {
  id: string;
  uploadId: string;
  rawName: string;
  detectedPct: number | null;
  inciSuggestion: string | null;
  casNumber: string | null;
  confidence: number;
  issues: string[];
  matchedIngredientId: string | null;
  matchedIngredient: { id: string; inciName: string } | null;
  matchType: MatchType;
  matchConfidence: number | null;
  createdAt: string;
};

export type FormulationUpload = {
  id: string;
  formulationId: string;
  productId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdByUserId: string;
  createdBy?: { id: string; fullName: string; email: string };
  createdAt: string;
  rawExtractJson: unknown;
  rows: FormulationUploadRow[];
};

export type ProductRange = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { products: number };
};

export type CreateProductPayload = {
  name: string;
  rangeId: string;
  productLine?: string;
  brand?: string;
  targetRegions: string[];
};

export type UpdateProductPayload = {
  name?: string;
  rangeId?: string;
  productLine?: string;
  targetRegions?: string[];
  brand?: string | null;
};

// ── Label types ──

export type RegionCode = "IN" | "AU";

export type LabelMetadata = {
  id: string;
  productId: string;
  region: RegionCode;
  versionNumber: number;
  isActive: boolean;
  productName: string;
  netQuantity: string;
  inciDeclaration: string;
  warnings: string | null;
  manufacturerName: string | null;
  manufacturerAddress: string | null;
  batchFormat: string | null;
  mfgDate: string | null;
  expDate: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string };
};

export type SaveLabelPayload = {
  region: RegionCode;
  productName: string;
  netQuantity: string;
  inciDeclaration: string;
  warnings?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  batchFormat?: string;
  mfgDate?: string;
  expDate?: string;
};

export type LabelValidationResult = {
  isValid: boolean;
  errors: string[];
};

// ── Document types ──

export type ProductDocumentType =
  | "COA"
  | "SDS"
  | "STABILITY_REPORT"
  | "MICROBIAL_REPORT"
  | "LAB_REPORT"
  | "PACKAGING_ARTWORK"
  | "OTHER";

export const DOC_TYPE_LABELS: Record<ProductDocumentType, string> = {
  COA: "Certificate of Analysis",
  SDS: "Safety Data Sheet",
  STABILITY_REPORT: "Stability Report",
  MICROBIAL_REPORT: "Microbial Report",
  LAB_REPORT: "Lab Report",
  PACKAGING_ARTWORK: "Packaging Artwork",
  OTHER: "Other",
};

export const REQUIRED_DOC_TYPES: ProductDocumentType[] = [
  "COA",
  "SDS",
  "STABILITY_REPORT",
  "MICROBIAL_REPORT",
];

export const EXPIRY_REQUIRED_TYPES: ProductDocumentType[] = ["COA", "SDS"];

export type ProductDocument = {
  id: string;
  productId: string;
  type: ProductDocumentType;
  versionNumber: number;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  sizeBytes: number;
  issueDate: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  createdBy: { id: string; fullName: string };
};
