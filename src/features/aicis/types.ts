export type AicisScrutinyResult = "FOUND" | "NOT_FOUND" | "NOT_LISTED" | "NEEDS_REVIEW" | "MISSING_CAS" | "AMBIGUOUS";
export type AicisMatchMethod = "CAS" | "NAME" | "SYNONYM" | "NONE";

export type AicisScrutinyRowFinding = {
  id: string;
  scrutinySnapshotId: string;
  uploadRowId: string;
  result: AicisScrutinyResult;
  matchMethod: AicisMatchMethod;
  casUsed: string | null;
  aicisChemicalId: string | null;
  matchedCrNo: string | null;
  matchedCasNo: string | null;
  matchedApprovedName: string | null;
  evidenceJson: {
    evidenceType: string;
    evidenceUrl: string | null;
    evidenceSnapshotId: string;
    evidenceSourceFileName: string | null;
    notes: string;
    reason?: string;
    casValidity?: "VALID" | "INVALID" | "MISSING";
    canonicalName?: string | null;
    canonicalSource?: string | null;
  };
  uploadRow: {
    id: string;
    rawName: string;
    inciSuggestion: string | null;
    casNumber: string | null;
    matchedIngredient: {
      inciName: string;
      casNumber: string | null;
    } | null;
  };
};

export type AicisScrutinySnapshot = {
  id: string;
  uploadId: string;
  snapshotId: string;
  regionCode: string;
  status: string;
  totalRows: number;
  foundCount: number;
  notFoundCount: number;
  notListedCount: number;
  needsReviewCount: number;
  missingCasCount: number;
  ambiguousCount: number;
  isActive: boolean;
  createdAt: string;
  snapshot: {
    versionName: string;
    asOfDate: string;
    sourceFileName: string;
  };
  findings: AicisScrutinyRowFinding[];
};

export type AicisRunResult = {
  scrutinySnapshotId: string;
  status: string;
  totalRows: number;
  foundCount: number;
  notFoundCount: number;
  notListedCount: number;
  needsReviewCount: number;
  missingCasCount: number;
  ambiguousCount: number;
};

export type AicisInventorySnapshotMeta = {
  id: string;
  versionName: string;
  regionCode: string;
  sourceFileName: string;
  fileSha256: string;
  rowCount: number;
  isActive: boolean;
  importedAt: string;
  importedBy: { id: string; fullName: string; email: string } | null;
  chemicalCount: number;
};

export type AicisActiveResponse = {
  active: boolean;
  snapshot: AicisInventorySnapshotMeta | null;
};

export type AicisImportResult = {
  snapshotId: string;
  versionName: string;
  regionCode: string;
  rowCount: number;
  isActive: boolean;
  importedAt: string;
  sourceFilename: string;
  fileSha256: string;
};

// ── Banned / Restricted types ──

export type BannedRestrictedSourceInfo = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  linkType: string;
  fetchStatus: "SUCCESS" | "FAILED";
  fetchedAt: string;
  contentHash: string | null;
  rawContentSize: number | null;
  errorMessage: string | null;
};

export type BannedRestrictedChemicalInfo = {
  id: string;
  sourceId: string;
  normalizedCasNo: string;
  chemicalName: string | null;
  matchText: string | null;
  evidenceUrl: string;
};

export type BannedRestrictedSnapshotSummary = {
  id: string;
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  isComplete: boolean;
  notes: string | null;
  sourcesTotal: number;
  sourcesSuccess: number;
  sourcesFailed: number;
  chemicalsCount: number;
  sources: BannedRestrictedSourceInfo[];
  chemicals: BannedRestrictedChemicalInfo[];
};

export type BannedRestrictedIngredientOutcome = {
  status: "CANNOT_CHECK" | "NEEDS_REVIEW" | "FOUND" | "FOUND_BY_NAME" | "NOT_LISTED";
  reason: string;
  evidenceLinks: { label: string; url: string }[];
  matchedSources?: { sourceName: string; sourceUrl: string; matchText: string | null }[];
  matchMethod?: "CAS" | "NAME" | "NONE";
};

export type BannedRestrictedRowResult = {
  uploadRowId: string;
  rawName: string;
  casNumber: string | null;
  outcome: BannedRestrictedIngredientOutcome;
};

export type BannedRestrictedUploadEvaluation = {
  snapshotId: string | null;
  snapshotFetchedAt: string | null;
  isComplete: boolean;
  rows: BannedRestrictedRowResult[];
};

export type BannedRestrictedSyncResult = {
  snapshotId: string;
  sourcesTotal: number;
  sourcesSuccess: number;
  sourcesFailed: number;
  chemicalsCount: number;
  isComplete: boolean;
};

export type BannedRestrictedIngestResult = BannedRestrictedSyncResult & {
  poisonsNameOnlyCount: number;
  fileDetails: {
    fileName: string;
    linkType: string;
    casCount: number;
    nameOnlyCount: number;
    status: "SUCCESS" | "FAILED";
    error?: string;
  }[];
};

// ── AICIS Chemical types ──

export type AicisChemical = {
  id: string;
  snapshotId: string;
  crNo: string;
  casNo: string | null;
  chemicalName: string | null;
  approvedName: string;
  molecularFormula: string | null;
  specificInfoRequirements: string | null;
  definedScope: string | null;
  conditionsOfUse: string | null;
  prescribedInfo: string | null;
  normalizedApprovedName: string;
  normalizedCasNo: string | null;
  additionalJson: { casNumbers?: string[] } | null;
  snapshot: {
    id: string;
    versionName: string;
    regionCode: string;
    sourceFileName: string;
    asOfDate: string;
    importedAt: string;
  };
};
