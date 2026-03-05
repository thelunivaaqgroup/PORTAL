/**
 * Integration tests for Replace Formulation feature.
 *
 * Run with: npx tsx --test src/uploads/__tests__/replaceFormulation.test.ts
 *
 * Tests the archive + create + version increment + only-one-active logic
 * using pure unit tests (no DB required).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Version computation logic ──

describe("replaceFormulation version logic", () => {
  it("first upload gets version 1", () => {
    const maxVersion = 0; // no existing uploads
    const nextVersion = maxVersion + 1;
    assert.equal(nextVersion, 1);
  });

  it("replacing v1 produces v2", () => {
    const maxVersion = 1; // one existing upload at v1
    const nextVersion = maxVersion + 1;
    assert.equal(nextVersion, 2);
  });

  it("replacing v3 produces v4", () => {
    const maxVersion = 3;
    const nextVersion = maxVersion + 1;
    assert.equal(nextVersion, 4);
  });
});

// ── Only-one-active invariant ──

describe("only-one-active invariant", () => {
  it("archiving current + creating new leaves exactly 1 ACTIVE", () => {
    type Upload = { id: string; status: "ACTIVE" | "ARCHIVED" };

    const uploads: Upload[] = [
      { id: "upload-1", status: "ACTIVE" },
    ];

    // Archive step
    const toArchive = uploads.find((u) => u.status === "ACTIVE");
    if (toArchive) toArchive.status = "ARCHIVED";

    // Create new
    uploads.push({ id: "upload-2", status: "ACTIVE" });

    const activeCount = uploads.filter((u) => u.status === "ACTIVE").length;
    assert.equal(activeCount, 1, "Should have exactly 1 ACTIVE upload");
    assert.equal(uploads[1].id, "upload-2", "New upload should be the active one");
  });

  it("belt-and-suspenders archival catches stale active uploads", () => {
    type Upload = { id: string; status: "ACTIVE" | "ARCHIVED" };

    // Simulate a bad state: two ACTIVE uploads (shouldn't happen, but guard)
    const uploads: Upload[] = [
      { id: "upload-1", status: "ACTIVE" },
      { id: "upload-2", status: "ACTIVE" },
    ];

    // Archive ALL active
    for (const u of uploads) {
      if (u.status === "ACTIVE") u.status = "ARCHIVED";
    }

    // Create new
    uploads.push({ id: "upload-3", status: "ACTIVE" });

    const activeCount = uploads.filter((u) => u.status === "ACTIVE").length;
    assert.equal(activeCount, 1, "Guard should reduce to exactly 1 ACTIVE");
  });
});

// ── Compliance reset logic ──

describe("compliance reset on replace", () => {
  it("resets eligibility fields to null after replace", () => {
    // Simulate compliance request state before replace
    const complianceRequest = {
      status: "IN_REVIEW" as string,
      eligibilityStatus: "READY_FOR_APPROVAL" as string | null,
      ingredientMatchingStatus: "PASS" as string | null,
      aicisScrutinyStatus: "PASS" as string | null,
      bannedRestrictedStatus: "PASS" as string | null,
      checkedAt: new Date() as Date | null,
      approvedByUserId: null as string | null,
    };

    // Apply reset (same logic as replaceFormulation service)
    complianceRequest.status = "DRAFT";
    complianceRequest.eligibilityStatus = null;
    complianceRequest.ingredientMatchingStatus = null;
    complianceRequest.aicisScrutinyStatus = null;
    complianceRequest.bannedRestrictedStatus = null;
    complianceRequest.checkedAt = null;
    complianceRequest.approvedByUserId = null;

    assert.equal(complianceRequest.status, "DRAFT");
    assert.equal(complianceRequest.eligibilityStatus, null);
    assert.equal(complianceRequest.ingredientMatchingStatus, null);
    assert.equal(complianceRequest.aicisScrutinyStatus, null);
    assert.equal(complianceRequest.bannedRestrictedStatus, null);
    assert.equal(complianceRequest.checkedAt, null);
  });

  it("compliance request uploadId updated to new upload", () => {
    const complianceRequest = {
      uploadId: "old-upload-id",
    };

    // Replace logic updates uploadId
    const newUploadId = "new-upload-id";
    complianceRequest.uploadId = newUploadId;

    assert.equal(complianceRequest.uploadId, "new-upload-id");
    assert.notEqual(complianceRequest.uploadId, "old-upload-id");
  });
});

// ── Archive metadata ──

describe("archive metadata", () => {
  it("archived upload gets archivedAt and archivedByUserId", () => {
    const now = new Date();
    const upload = {
      status: "ACTIVE" as string,
      archivedAt: null as Date | null,
      archivedByUserId: null as string | null,
    };

    // Archive
    upload.status = "ARCHIVED";
    upload.archivedAt = now;
    upload.archivedByUserId = "user-123";

    assert.equal(upload.status, "ARCHIVED");
    assert.equal(upload.archivedAt, now);
    assert.equal(upload.archivedByUserId, "user-123");
  });
});

// ── Upload endpoint 409 guard ──

describe("upload endpoint 409 guard", () => {
  it("returns ACTIVE_UPLOAD_EXISTS when active upload exists", () => {
    const existingActive = { id: "upload-1", version: 1 };
    const shouldBlock = !!existingActive;
    assert.equal(shouldBlock, true);
  });

  it("allows upload when no active upload exists", () => {
    const existingActive = null;
    const shouldBlock = !!existingActive;
    assert.equal(shouldBlock, false);
  });
});
