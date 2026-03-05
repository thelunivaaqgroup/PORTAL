// ── Compliance Request Types ──

export type ComplianceRequestStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";

// 3-state enums
export type CheckStatus = "PASS" | "NEEDS_REVIEW" | "FAIL";
export type EligibilityStatus = "NOT_ELIGIBLE" | "ELIGIBLE" | "ELIGIBLE_WITH_WARNINGS" | "READY_FOR_APPROVAL" | "APPROVED";

// Legacy check shape (backward compat)
export type EligibilityCheck = {
  key: string;
  label: string;
  passed: boolean;
  reason: string;
  evidenceLinks: string[];
};

// Legacy report shape (backward compat)
export type EligibilityReport = {
  eligible: boolean;
  checks: EligibilityCheck[];
  checkedAt: string;
};

// 3-state check shape
export type CheckResult = {
  key: string;
  label: string;
  status: CheckStatus;
  reason: string;
  evidenceLinks: string[];
  issues: Issue[];
  evidenceRequired: EvidenceRequirement[];
};

export type Issue = {
  severity: "ERROR" | "WARNING" | "INFO";
  ingredientName: string | null;
  message: string;
};

export type EvidenceRequirement = {
  ingredientName: string;
  requiredDocuments: string[];
  reason: string;
};

// 3-state report shape
export type EligibilityReport3 = {
  eligibilityStatus: EligibilityStatus;
  ingredientMatchingStatus: CheckStatus;
  aicisScrutinyStatus: CheckStatus;
  bannedRestrictedStatus: CheckStatus;
  checks: CheckResult[];
  issues: Issue[];
  evidenceRequired: EvidenceRequirement[];
  checkedAt: string;
};

export type ApproverStatus = {
  namePattern: string;
  requiredRole: string;
  matchedUserId: string | null;
  matchedUserName: string | null;
  decision: "APPROVED" | "REJECTED" | null;
  decidedAt: string | null;
};

export type ComplianceApproval = {
  id: string;
  requestId: string;
  approverUserId: string;
  decision: "APPROVED" | "REJECTED";
  comment: string | null;
  decidedAt: string;
  approver: {
    id: string;
    fullName: string;
    email: string;
    role: string;
  };
};

export type GeneratedArtifact = {
  id: string;
  requestId: string;
  productId: string;
  type: "MARKETING_PLAN" | "LAYOUT_BRIEF" | "COLOR_SEQUENCE" | "PACKAGING_BRIEF";
  versionNumber: number;
  contentMarkdown: string | null;
  contentJson: Record<string, unknown> | null;
  generationMeta: Record<string, unknown> | null;
  createdAt: string;
  createdByUserId: string;
  createdBy?: { id: string; fullName: string };
};

export type ComplianceRequest = {
  id: string;
  productId: string;
  uploadId: string;
  regionScope: string[];
  status: ComplianceRequestStatus;
  aicisSnapshotId: string | null;
  bannedRestrictedSnapshotId: string | null;
  eligibleAt: string | null;
  eligibilityReportJson: EligibilityReport | null;
  // 3-state fields
  eligibilityStatus: EligibilityStatus | null;
  ingredientMatchingStatus: CheckStatus | null;
  aicisScrutinyStatus: CheckStatus | null;
  bannedRestrictedStatus: CheckStatus | null;
  issuesJson: Issue[] | null;
  evidenceRequiredJson: EvidenceRequirement[] | null;
  checkedAt: string | null;
  checkedByUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  // Single-admin approval fields
  approvedByUserId: string | null;
  approvedAt: string | null;
  approvedBy: { id: string; fullName: string; email: string } | null;
  product: { id: string; name: string; skuCode: string; brand?: string | null };
  upload: { id: string; fileName: string; createdAt: string };
  createdBy: { id: string; fullName: string; email: string };
  approvals: ComplianceApproval[];
  artifacts: GeneratedArtifact[];
};

export type ApprovalResult = {
  approval: ComplianceApproval;
  approved: boolean;
  requestStatus: ComplianceRequestStatus;
  artifacts: GeneratedArtifact[];
};

export type EligibilityResult = {
  request: ComplianceRequest;
  report: EligibilityReport;
  report3?: EligibilityReport3;
};

// ── Ingredient Resolution Types ──

export type IngredientType = "STANDARD" | "BOTANICAL" | "BLEND" | "POLYMER" | "TRADE_NAME";

export type UnmatchedRow = {
  id: string;
  rawName: string;
  casNumber: string | null;
  inciSuggestion: string | null;
  detectedPct: number | null;
  ingredientType: IngredientType | null;
  inferredCategory: string;
  evidenceDocs: { id: string; fileName: string; docType: string; createdAt: string }[];
};

export type IngredientSearchResult = {
  id: string;
  inciName: string;
  casNumber: string | null;
  synonyms: string[];
};

export type ResolvePayload = {
  requestId: string;
  uploadRowId: string;
  ingredientMasterId?: string;
  createPayload?: {
    inciName: string;
    casNumber?: string | null;
    synonyms?: string[];
  };
  addSynonym?: boolean;
  ingredientType: IngredientType;
  casNumber?: string | null;
  evidenceDocIds?: string[];
};

export type ResolveResult = {
  uploadRowId: string;
  matchedIngredientId: string;
  matchedInciName: string;
  ingredientType: IngredientType;
  synonymAdded: boolean;
  evidenceDocsLinked: number;
};

export type AutoResolveResult = {
  total: number;
  resolved: number;
  skippedMissingCas: number;
  createdMasters: number;
  errors: { rowId: string; rawName: string; reason: string }[];
};
