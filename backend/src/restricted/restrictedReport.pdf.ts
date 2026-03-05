import { chromium } from "playwright";
import type { RestrictedReportData } from "./restrictedReport.service.js";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusColor(status: string): string {
  switch (status) {
    case "BANNED": return "#8B0000";
    case "RESTRICTED": return "#FF4444";
    case "LISTED": return "#22C55E";
    case "NOT_FOUND": return "#CCCCCC";
    case "CANNOT_CHECK": return "#FFA500";
    default: return "#CCCCCC";
  }
}

function isLightText(status: string): boolean {
  return ["BANNED", "RESTRICTED"].includes(status);
}

function buildHtml(data: RestrictedReportData): string {
  const s = data.summary;
  const checkedDate = new Date(s.checkedAt).toLocaleString();
  const generatedDate = new Date().toLocaleString();

  const hitsRows = data.hits
    .map(
      (h) => `
      <tr>
        <td>${escapeHtml(h.ingredient)}</td>
        <td>${escapeHtml(h.inciName ?? "")}</td>
        <td class="mono">${escapeHtml(h.casNumber ?? "")}</td>
        <td style="background:${statusColor(h.restrictedStatus)};color:${isLightText(h.restrictedStatus) ? "#fff" : "#000"};font-weight:600;">
          ${escapeHtml(h.restrictedStatus)}
        </td>
        <td class="small">${escapeHtml(h.reason)}</td>
        <td>${escapeHtml(h.sourceLineRef)}</td>
        <td>${escapeHtml(h.evidenceUrl)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Restricted Chemicals Report — ${escapeHtml(s.productName)}</title>
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

<h1>Restricted Chemicals Report</h1>
<p class="subtitle">${escapeHtml(s.productName)} (${escapeHtml(s.skuCode)}) — Generated ${generatedDate}</p>

<h2>Summary</h2>
<div class="summary-grid">
  <div class="summary-item"><span class="summary-label">Product</span><span class="summary-value">${escapeHtml(s.productName)}</span></div>
  <div class="summary-item"><span class="summary-label">SKU Code</span><span class="summary-value">${escapeHtml(s.skuCode)}</span></div>
  <div class="summary-item"><span class="summary-label">Brand</span><span class="summary-value">${escapeHtml(s.brand ?? "N/A")}</span></div>
  <div class="summary-item"><span class="summary-label">Region(s)</span><span class="summary-value">${escapeHtml(s.regions.join(", ") || "N/A")}</span></div>
  <div class="summary-item"><span class="summary-label">Dataset</span><span class="summary-value">${escapeHtml(s.datasetName)} v${escapeHtml(s.datasetVersion)}</span></div>
  <div class="summary-item"><span class="summary-label">Checked At</span><span class="summary-value">${escapeHtml(checkedDate)}</span></div>
  <div class="summary-item"><span class="summary-label">Total Ingredients</span><span class="summary-value">${s.totalIngredients}</span></div>
  <div class="summary-item"><span class="summary-label">Checked by CAS</span><span class="summary-value">${s.checkedByCas}</span></div>
  <div class="summary-item"><span class="summary-label">Missing CAS</span><span class="summary-value">${s.missingCas}</span></div>
  <div class="summary-item"><span class="summary-label">Banned</span><span class="summary-value" style="color:#8B0000;font-weight:600;">${s.bannedCount}</span></div>
  <div class="summary-item"><span class="summary-label">Restricted</span><span class="summary-value" style="color:#FF4444;font-weight:600;">${s.restrictedCount}</span></div>
  <div class="summary-item"><span class="summary-label">Listed</span><span class="summary-value">${s.listedCount}</span></div>
  <div class="summary-item"><span class="summary-label">Not Found in Index</span><span class="summary-value">${s.notFoundCount}</span></div>
</div>

<h2>Banned / Restricted Hits (${data.hits.length})</h2>
${data.hits.length === 0
  ? "<p>No banned or restricted chemicals found. All checked ingredients passed.</p>"
  : `<table>
  <thead>
    <tr>
      <th>Ingredient</th>
      <th>INCI / Master Name</th>
      <th>CAS No</th>
      <th>Status</th>
      <th>Reason</th>
      <th>Source Line Ref</th>
      <th>Evidence URL</th>
    </tr>
  </thead>
  <tbody>
    ${hitsRows}
  </tbody>
</table>`}

<div class="footer">
  Restricted Chemicals Report — ${escapeHtml(s.productName)} (${escapeHtml(s.skuCode)}) — Dataset: ${escapeHtml(s.datasetName)} v${escapeHtml(s.datasetVersion)} — Generated ${generatedDate}
</div>

</body>
</html>`;
}

export async function generateRestrictedPdfReport(data: RestrictedReportData): Promise<Buffer> {
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
