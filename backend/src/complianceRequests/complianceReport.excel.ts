import XLSX from "xlsx";
import type { ComplianceReportData } from "./complianceReport.service.js";

export async function generateExcelReport(data: ComplianceReportData): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const s = data.summary;

  // ── Sheet 1: Summary ──
  const summaryData = [
    ["Field", "Value"],
    ["Product Name", s.productName],
    ["SKU Code", s.skuCode],
    ["Brand", s.brand ?? ""],
    ["Region(s)", s.regions.join(", ")],
    ["Checked At", s.checkedAt ? new Date(s.checkedAt).toLocaleString() : "N/A"],
    ["", ""],
    ["Overall Eligibility", s.eligibilityStatus ?? "N/A"],
    ["Ingredient Matching", s.ingredientMatchingStatus ?? "N/A"],
    ["AICIS Scrutiny", s.aicisScrutinyStatus ?? "N/A"],
    ["Banned/Restricted", s.bannedRestrictedStatus ?? "N/A"],
    ["", ""],
    ["Total Ingredients", s.totalIngredients],
    ["Matched Ingredients", s.matchedIngredients],
    ["Missing CAS", s.missingCasCount],
    ["Not Found in AICIS", s.aicisNotFoundCount],
    ["Banned/Restricted Hits", s.bannedRestrictedHits],
    ["Poisonous/Scheduled Hits", s.poisonousScheduledHits],
    ["Needs Review", s.needsReviewCount],
    ["Evidence Required", s.evidenceRequiredCount],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 40 }];
  // Freeze header row
  summarySheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // ── Sheet 2: Exceptions ──
  const excHeaders = [
    "Ingredient",
    "INCI / Master Name",
    "CAS No",
    "Issue Category",
    "AICIS Result",
    "Evidence Required",
    "Reason",
    "Source",
    "Evidence Link",
  ];
  const excRows = data.exceptions.map((exc) => [
    exc.ingredient,
    exc.inciName ?? "",
    exc.casNumber ?? "",
    exc.issueCategory,
    exc.aicisResult,
    exc.evidenceRequired,
    exc.reason,
    exc.source,
    exc.evidenceLink,
  ]);

  const excSheet = XLSX.utils.aoa_to_sheet([excHeaders, ...excRows]);
  excSheet["!cols"] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 22 },
    { wch: 15 }, { wch: 35 }, { wch: 45 }, { wch: 20 }, { wch: 20 },
  ];
  excSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, excSheet, "Exceptions");

  // ── Sheet 3: All Ingredients ──
  const allHeaders = [
    "Ingredient",
    "INCI / Master Name",
    "CAS No",
    "Concentration",
    "Match Status",
    "Match Type",
    "AICIS Result",
    "Issues",
  ];
  const allRows = data.allIngredients.map((ing) => [
    ing.ingredient,
    ing.inciName ?? "",
    ing.casNumber ?? "",
    ing.concentration,
    ing.matchStatus,
    ing.matchType,
    ing.aicisResult,
    ing.issues,
  ]);

  const allSheet = XLSX.utils.aoa_to_sheet([allHeaders, ...allRows]);
  allSheet["!cols"] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 14 },
    { wch: 14 }, { wch: 14 }, { wch: 15 }, { wch: 50 },
  ];
  allSheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, allSheet, "All Ingredients");

  // Write to buffer
  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuffer);
}
