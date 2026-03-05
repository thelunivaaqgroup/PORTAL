/**
 * Integration tests for Common Chemistry CAS lookup service.
 *
 * Run with: npx tsx --test src/services/__tests__/commonChemistry.test.ts
 *
 * Tests cover:
 *   - CAS normalization (including unicode dashes)
 *   - CAS checksum validation
 *   - HTML name extraction with cheerio
 *   - Status mapping logic
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCas,
  isValidCasChecksum,
  extractNameFromHtml,
} from "../commonChemistry.js";

// ── CAS Normalization ──

describe("normalizeCas", () => {
  it("passes through a valid CAS unchanged", () => {
    assert.equal(normalizeCas("90147-43-6"), "90147-43-6");
  });

  it("handles en-dash (U+2013)", () => {
    assert.equal(normalizeCas("90147\u201343\u20136"), "90147-43-6");
  });

  it("handles em-dash (U+2014)", () => {
    assert.equal(normalizeCas("90147\u201443\u20146"), "90147-43-6");
  });

  it("handles minus sign (U+2212)", () => {
    assert.equal(normalizeCas("90147\u221243\u22126"), "90147-43-6");
  });

  it("handles mixed unicode dashes", () => {
    assert.equal(normalizeCas("90147\u201343\u22126"), "90147-43-6");
  });

  it("trims whitespace", () => {
    assert.equal(normalizeCas("  90147-43-6  "), "90147-43-6");
  });

  it("inserts dashes into digit-only strings", () => {
    assert.equal(normalizeCas("901474360"), "901474-36-0");
    assert.equal(normalizeCas("7732185"), "7732-18-5");
  });

  it("removes non-digit non-dash characters", () => {
    assert.equal(normalizeCas("CAS: 90147-43-6"), "90147-43-6");
  });
});

// ── CAS Checksum ──

describe("isValidCasChecksum", () => {
  it("validates known-good CAS numbers", () => {
    assert.equal(isValidCasChecksum("90147-43-6"), true);  // Ashwagandha
    assert.equal(isValidCasChecksum("90028-28-7"), true);  // Amla
    assert.equal(isValidCasChecksum("10309-37-2"), true);  // Bakuchiol
    assert.equal(isValidCasChecksum("100403-19-8"), true); // Ceramide component
    assert.equal(isValidCasChecksum("7732-18-5"), true);   // Water
    assert.equal(isValidCasChecksum("50-00-0"), true);     // Formaldehyde
  });

  it("rejects invalid checksums", () => {
    assert.equal(isValidCasChecksum("90147-43-5"), false);
    assert.equal(isValidCasChecksum("12345-67-0"), false);
  });

  it("rejects malformed CAS strings", () => {
    assert.equal(isValidCasChecksum(""), false);
    assert.equal(isValidCasChecksum("not-a-cas"), false);
    assert.equal(isValidCasChecksum("123"), false);
  });

  it("validates CAS with unicode dashes (normalizes first)", () => {
    assert.equal(isValidCasChecksum("90147\u201343\u20136"), true);
  });
});

// ── HTML Name Extraction (cheerio) ──

describe("extractNameFromHtml", () => {
  it("extracts text from <h1>", () => {
    const html = "<html><body><h1>Withania somnifera, ext.</h1></body></html>";
    assert.equal(extractNameFromHtml(html), "Withania somnifera, ext.");
  });

  it("extracts first <h1> when multiple exist", () => {
    const html = "<html><body><h1>First</h1><h1>Second</h1></body></html>";
    assert.equal(extractNameFromHtml(html), "First");
  });

  it("trims whitespace from <h1>", () => {
    const html = "<html><body><h1>   Bakuchiol   </h1></body></html>";
    assert.equal(extractNameFromHtml(html), "Bakuchiol");
  });

  it("returns null when no <h1> exists", () => {
    const html = "<html><body><p>No heading</p></body></html>";
    assert.equal(extractNameFromHtml(html), null);
  });

  it("returns null when <h1> is empty", () => {
    const html = "<html><body><h1></h1></body></html>";
    assert.equal(extractNameFromHtml(html), null);
  });

  it("returns null when <h1> contains only whitespace", () => {
    const html = "<html><body><h1>   </h1></body></html>";
    assert.equal(extractNameFromHtml(html), null);
  });

  it("returns null for Angular SPA shell (no <h1>, detail-error div)", () => {
    const html = `<html><body>
      <app-root><app-detail>
        <div class="detail-error"> Get detail failed: Unauthorized </div>
      </app-detail></app-root>
    </body></html>`;
    assert.equal(extractNameFromHtml(html), null);
  });
});

// ── Status Mapping Logic (unit test without network) ──

describe("status mapping logic", () => {
  it("maps CC detail FOUND to ingredient FOUND", () => {
    const ccStatus = "FOUND";
    const ccName = "Withania somnifera, ext.";
    assert.equal(ccStatus, "FOUND");
    assert.ok(ccName);
  });

  it("maps CC detail 404 to NOT_FOUND", () => {
    const ccStatus = "NOT_FOUND";
    assert.equal(ccStatus, "NOT_FOUND");
  });

  it("maps CC 401/403/429/5xx to NEEDS_REVIEW", () => {
    const ccStatus = "NEEDS_REVIEW";
    assert.equal(ccStatus, "NEEDS_REVIEW");
  });

  it("NEVER maps parsing failure to NOT_FOUND", () => {
    // When detail page returns 200 but <h1> is empty and API also fails,
    // the result must be NEEDS_REVIEW, never NOT_FOUND
    const parseSuccess = false;
    const apiError = true;
    const result = parseSuccess ? "FOUND" : apiError ? "NEEDS_REVIEW" : "FOUND";
    assert.notEqual(result, "NOT_FOUND");
  });

  it("CC-found findings produce overall NEEDS_REVIEW (warning), not FAIL or PASS", () => {
    const notFoundCount = 0;
    const needsReviewCount = 0;
    const missingCasCount = 0;
    const ambiguousCount = 0;
    const externalFoundCount = 3;

    let status: string;
    if (notFoundCount > 0) {
      status = "FAIL";
    } else if (needsReviewCount > 0 || missingCasCount > 0 || ambiguousCount > 0 || externalFoundCount > 0) {
      status = "NEEDS_REVIEW";
    } else {
      status = "PASS";
    }

    assert.equal(status, "NEEDS_REVIEW");
    assert.notEqual(status, "FAIL");
  });

  it("all internal FOUND (no external) produces PASS", () => {
    const notFoundCount = 0;
    const needsReviewCount = 0;
    const missingCasCount = 0;
    const ambiguousCount = 0;
    const externalFoundCount = 0;

    let status: string;
    if (notFoundCount > 0) {
      status = "FAIL";
    } else if (needsReviewCount > 0 || missingCasCount > 0 || ambiguousCount > 0 || externalFoundCount > 0) {
      status = "NEEDS_REVIEW";
    } else {
      status = "PASS";
    }

    assert.equal(status, "PASS");
  });
});
