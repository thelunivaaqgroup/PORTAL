import XLSX from "xlsx";
import type { RestrictedReportData } from "./restrictedReport.service.js";

export async function generateRestrictedExcelReport(data: RestrictedReportData): Promise<Buffer> {
  const wb = XLSX.utils.book_new();
  const s = data.summary;

  // ── Sheet 1: Summary ──
  const summaryData = [
    ["Field", "Value"],
    ["Product Name", s.productName],
    ["SKU Code", s.skuCode],
    ["Brand", s.brand ?? ""],
    ["Region(s)", s.regions.join(", ")],
    ["", ""],
    ["Dataset Name", s.datasetName],
    ["Dataset Version", s.datasetVersion],
    ["Dataset Effective Date", s.datasetEffectiveDate ? new Date(s.datasetEffectiveDate).toLocaleDateString() : "N/A"],
    ["Checked At", new Date(s.checkedAt).toLocaleString()],
    ["", ""],
    ["Total Ingredients", s.totalIngredients],
    ["Checked by CAS", s.checkedByCas],
    ["Missing CAS", s.missingCas],
    ["Banned", s.bannedCount],
    ["Restricted", s.restrictedCount],
    ["Listed", s.listedCount],
    ["Not Found in Index", s.notFoundCount],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet["!cols"] = [{ wch: 25 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  // ── Sheet 2: Hits (Banned/Restricted) ──
  const hitHeaders = [
    "Ingredient",
    "INCI / Master Name",
    "CAS No",
    "Status",
    "Reason",
    "Source Line Ref",
    "Evidence URL",
  ];
  const hitRows = data.hits.map((h) => [
    h.ingredient,
    h.inciName ?? "",
    h.casNumber ?? "",
    h.restrictedStatus,
    h.reason,
    h.sourceLineRef,
    h.evidenceUrl,
  ]);

  const hitSheet = XLSX.utils.aoa_to_sheet([hitHeaders, ...hitRows]);
  hitSheet["!cols"] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 14 },
    { wch: 40 }, { wch: 20 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, hitSheet, "Banned & Restricted");

  // ── Sheet 3: All Ingredients ──
  const allHeaders = [
    "Ingredient",
    "INCI / Master Name",
    "CAS No",
    "Restricted Status",
    "Reason",
    "Source Line Ref",
    "Evidence URL",
  ];
  const allRows = data.allIngredients.map((ing) => [
    ing.ingredient,
    ing.inciName ?? "",
    ing.casNumber ?? "",
    ing.restrictedStatus,
    ing.reason,
    ing.sourceLineRef,
    ing.evidenceUrl,
  ]);

  const allSheet = XLSX.utils.aoa_to_sheet([allHeaders, ...allRows]);
  allSheet["!cols"] = [
    { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 14 },
    { wch: 40 }, { wch: 20 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, allSheet, "All Ingredients");

  const xlsxBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return Buffer.from(xlsxBuffer);
}
