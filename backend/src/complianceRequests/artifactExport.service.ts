import { chromium } from "playwright";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { GeneratedArtifact } from "@prisma/client";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToSimpleHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      blocks.push("<p class=\"empty\">&nbsp;</p>");
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      blocks.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else {
      blocks.push(`<p>${escapeHtml(trimmed)}</p>`);
    }
  }
  return blocks.join("\n");
}

export async function generateArtifactPdf(artifact: GeneratedArtifact): Promise<Buffer> {
  const content = artifact.contentMarkdown ?? (artifact.contentJson
    ? JSON.stringify(artifact.contentJson, null, 2)
    : "No content.");
  const bodyHtml = markdownToSimpleHtml(content);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(artifact.type)} — v${artifact.versionNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; padding: 24px; }
    h1 { font-size: 18pt; margin: 0 0 12px; }
    h2 { font-size: 14pt; margin: 16px 0 8px; }
    p { margin: 0 0 8px; }
    p.empty { margin: 4px 0; }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px", left: "20px", right: "20px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function generateArtifactDocx(artifact: GeneratedArtifact): Promise<Buffer> {
  const content = artifact.contentMarkdown ?? (artifact.contentJson
    ? JSON.stringify(artifact.contentJson, null, 2)
    : "No content.");
  const lines = content.split(/\r?\n/);
  const children: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: trimmed.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (trimmed) {
      children.push(
        new Paragraph({
          children: [new TextRun(trimmed)],
          spacing: { after: 120 },
        }),
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length > 0 ? children : [
          new Paragraph({ children: [new TextRun("No content.")] }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
