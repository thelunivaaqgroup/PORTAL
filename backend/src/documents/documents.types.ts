export interface UploadDocumentBody {
  type: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
}

export const VALID_DOC_TYPES = [
  "COA",
  "SDS",
  "STABILITY_REPORT",
  "MICROBIAL_REPORT",
  "LAB_REPORT",
  "PACKAGING_ARTWORK",
  "OTHER",
] as const;

export const REQUIRED_DOC_TYPES = [
  "COA",
  "SDS",
  "STABILITY_REPORT",
  "MICROBIAL_REPORT",
] as const;

export const EXPIRY_REQUIRED_TYPES = ["COA", "SDS"] as const;

export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
];
