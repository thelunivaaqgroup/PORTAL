import { chromium } from "playwright";
import type { ComplianceReportData } from "./complianceReport.service.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function issueCategoryColor(category: string): string {
  const primary = category.split(";")[0].trim();
  switch (primary) {
    case "Missing CAS": return "#FFA500";
    case "Not in AICIS": return "#FF4444";
    case "Needs Review": return "#FFD700";
    case "Banned/Restricted": return "#8B0000";
    case "Poisonous/Scheduled": return "#8B0000";
    case "Ambiguous": return "#FFD700";
    case "Unresolved": return "#FFA500";
    default: return "#CCCCCC";
  }
}

function isDarkCategory(category: string): boolean {
  const primary = category.split(";")[0].trim();
  return ["Banned/Restricted", "Poisonous/Scheduled", "Not in AICIS"].includes(primary);
}

function buildHtml(data: ComplianceReportData): string {
  const s = data.summary;
  const checkedDate = s.checkedAt ? new Date(s.checkedAt).toLocaleString() : "N/A";
  const generatedDate = new Date().toLocaleString();

  const statusColor =
    s.eligibilityStatus === "READY_FOR_APPROVAL" || s.eligibilityStatus === "APPROVED"
      ? "#22C55E"
      : s.eligibilityStatus === "ELIGIBLE_WITH_WARNINGS"
        ? "#F59E0B"
        : "#EF4444";

  const exceptionsRows = data.exceptions
    .map(
      (exc) => `
      <tr>
        <td>${escapeHtml(exc.ingredient)}</td>
        <td>${escapeHtml(exc.inciName ?? "")}</td>
        <td class="mono">${escapeHtml(exc.casNumber ?? "")}</td>
        <td style="background:${issueCategoryColor(exc.issueCategory)};color:${isDarkCategory(exc.issueCategory) ? "#fff" : "#000"};font-weight:600;">
          ${escapeHtml(exc.issueCategory)}
        </td>
        <td>${escapeHtml(exc.aicisResult)}</td>
        <td class="small">${escapeHtml(exc.evidenceRequired)}</td>
        <td class="small">${escapeHtml(exc.reason)}</td>
        <td>${escapeHtml(exc.source)}</td>
        <td>${escapeHtml(exc.evidenceLink)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Compliance Exceptions Report — ${escapeHtml(s.productName)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11px; color: #1a1a1a; padding: 24px; }
  h1 { font-size: 18px; margin-bottom: 4px; color: #1F4E79; }
  h2 { font-size: 14px; margin: 18px 0 8px; color: #1F4E79; border-bottom: 2px solid #1F4E79; padding-bottom: 4px; }
  .subtitle { font-size: 11px; color: #666; margin-bottom: 16px; }
  .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 16px; }
  .summary-item { display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding: 3px 0; }
  .summary-label { font-weight: 600; color: #333; }
  .summary-value { color: #555; }
  .status-badge { display: inline-block; padding: 2px 10px; border-radius: 4px; font-weight: 700; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px; }
  th { background: #1F4E79; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #f8f9fa; }
  .mono { font-family: "SF Mono", "Consolas", monospace; font-size: 10px; }
  .small { font-size: 9px; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; text-align: center; }
  @media print { body { padding: 12px; } }
</style>
</head>
<body>

<h1>Compliance Exceptions Report</h1>
<p class="subtitle">${escapeHtml(s.productName)} (${escapeHtml(s.skuCode)}) — Generated ${generatedDate}</p>

<h2>Summary</h2>
<div class="summary-grid">
  <div class="summary-item"><span class="summary-label">Product</span><span class="summary-value">${escapeHtml(s.productName)}</span></div>
  <div class="summary-item"><span class="summary-label">SKU Code</span><span class="summary-value">${escapeHtml(s.skuCode)}</span></div>
  <div class="summary-item"><span class="summary-label">Brand</span><span class="summary-value">${escapeHtml(s.brand ?? "N/A")}</span></div>
  <div class="summary-item"><span class="summary-label">Region(s)</span><span class="summary-value">${escapeHtml(s.regions.join(", ") || "N/A")}</span></div>
  <div class="summary-item"><span class="summary-label">Checked At</span><span class="summary-value">${escapeHtml(checkedDate)}</span></div>
  <div class="summary-item">
    <span class="summary-label">Overall Status</span>
    <span class="status-badge" style="background:${statusColor};color:#fff;">${escapeHtml(s.eligibilityStatus ?? "N/A")}</span>
  </div>
  <div class="summary-item"><span class="summary-label">Total Ingredients</span><span class="summary-value">${s.totalIngredients}</span></div>
  <div class="summary-item"><span class="summary-label">Matched</span><span class="summary-value">${s.matchedIngredients}</span></div>
  <div class="summary-item"><span class="summary-label">Missing CAS</span><span class="summary-value">${s.missingCasCount}</span></div>
  <div class="summary-item"><span class="summary-label">Not in AICIS</span><span class="summary-value">${s.aicisNotFoundCount}</span></div>
  <div class="summary-item"><span class="summary-label">Banned/Restricted Hits</span><span class="summary-value">${s.bannedRestrictedHits}</span></div>
  <div class="summary-item"><span class="summary-label">Poisonous/Scheduled</span><span class="summary-value">${s.poisonousScheduledHits}</span></div>
  <div class="summary-item"><span class="summary-label">Needs Review</span><span class="summary-value">${s.needsReviewCount}</span></div>
  <div class="summary-item"><span class="summary-label">Evidence Required</span><span class="summary-value">${s.evidenceRequiredCount}</span></div>
</div>

<h2>Exceptions (${data.exceptions.length})</h2>
${data.exceptions.length === 0
  ? "<p>No exceptions found. All ingredients passed compliance checks.</p>"
  : `<table>
  <thead>
    <tr>
      <th>Ingredient</th>
      <th>INCI / Master Name</th>
      <th>CAS No</th>
      <th>Issue Category</th>
      <th>AICIS Result</th>
      <th>Evidence Required</th>
      <th>Reason</th>
      <th>Source</th>
      <th>Evidence Link</th>
    </tr>
  </thead>
  <tbody>
    ${exceptionsRows}
  </tbody>
</table>`}

<div class="footer">
  Compliance Exceptions Report — ${escapeHtml(s.productName)} (${escapeHtml(s.skuCode)}) — Generated ${generatedDate}
</div>

</body>
</html>`;
}

export async function generatePdfReport(data: ComplianceReportData): Promise<Buffer> {
  const html = buildHtml(data);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "16px", bottom: "16px", left: "16px", right: "16px" },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
}
