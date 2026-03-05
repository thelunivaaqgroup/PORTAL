import type { BannedRestrictedLinkType, BannedRestrictedFetchStatus } from "@prisma/client";

export type BannedRestrictedSourceInfo = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  linkType: BannedRestrictedLinkType;
  fetchStatus: BannedRestrictedFetchStatus;
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

/**
 * Per-ingredient outcome from banned/restricted scrutiny.
 *
 * Status semantics:
 *   CANNOT_CHECK   — No complete snapshot available at all
 *   NEEDS_REVIEW   — Missing/invalid CAS; snapshot exists but ingredient cannot be verified by CAS
 *   FOUND          — CAS found in indexed banned/restricted evidence sources
 *   FOUND_BY_NAME  — Ingredient name matched a Poisons Standard scheduled substance (name-only)
 *   NOT_LISTED     — CAS not found in any indexed source (snapshot is complete)
 */
export type BannedRestrictedIngredientOutcome = {
  status: "CANNOT_CHECK" | "NEEDS_REVIEW" | "FOUND" | "FOUND_BY_NAME" | "NOT_LISTED";
  reason: string;
  evidenceLinks: { label: string; url: string }[];
  matchedSources?: { sourceName: string; sourceUrl: string; matchText: string | null }[];
  matchMethod?: "CAS" | "NAME" | "NONE";
};

/** Per-row result from upload evaluation */
export type BannedRestrictedRowResult = {
  uploadRowId: string;
  rawName: string;
  casNumber: string | null;
  outcome: BannedRestrictedIngredientOutcome;
};

/** Full upload evaluation response */
export type BannedRestrictedUploadEvaluation = {
  snapshotId: string | null;
  snapshotFetchedAt: string | null;
  rows: BannedRestrictedRowResult[];
};

/** Sync result returned by syncBannedRestricted */
export type BannedRestrictedSyncResult = {
  snapshotId: string;
  sourcesTotal: number;
  sourcesSuccess: number;
  sourcesFailed: number;
  chemicalsCount: number;
  isComplete: boolean;
};
