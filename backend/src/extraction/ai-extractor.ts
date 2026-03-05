import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env.js";
import type { ParsedFileContent, ExtractedRow } from "./extraction.types.js";

const EXTRACTION_PROMPT = `You are a formulation chemistry data extractor. Given the raw content of a formulation document, extract every ingredient row into a structured JSON array.

Each row must have:
- "rawName": the ingredient name exactly as written
- "suggestedInciName": the INCI (International Nomenclature of Cosmetic Ingredients) name if you can identify it, or null
- "concentrationPct": the concentration percentage as a number (0-100), or null if not found
- "confidence": your confidence in this row's accuracy (0.0 to 1.0)
- "issues": array of issue strings, e.g. ["Missing concentration percentage"], ["Unknown ingredient"], []

Rules:
- Extract ALL ingredients, even if some data is missing
- If concentration is missing, set concentrationPct to null and add issue "Missing concentration percentage"
- If the ingredient name is unclear, still include it with lower confidence
- Do not invent data. Only extract what is present.
- Return ONLY a valid JSON array, no markdown, no explanation.

Example output:
[
  {"rawName": "Aqua", "suggestedInciName": "Water", "concentrationPct": 70.0, "confidence": 0.95, "issues": []},
  {"rawName": "Glycerin", "suggestedInciName": "Glycerin", "concentrationPct": null, "confidence": 0.6, "issues": ["Missing concentration percentage"]}
]`;

export async function extractWithAI(parsed: ParsedFileContent): Promise<ExtractedRow[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured — AI extraction unavailable");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let content: Anthropic.Messages.ContentBlockParam[];

  if (parsed.format === "image") {
    // Use vision: rawText contains base64
    const mimeMap: Record<string, string> = {
      image: "image/png",
    };
    content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: parsed.rawText,
        },
      },
      {
        type: "text",
        text: "Extract all ingredient rows from this formulation image/table. Return a JSON array as specified.",
      },
    ];
  } else {
    content = [
      {
        type: "text",
        text: `Here is the raw content of a formulation file (${parsed.format} format):\n\n${parsed.rawText}\n\nExtract the ingredient rows as a JSON array.`,
      },
    ];
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: EXTRACTION_PROMPT,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("AI returned no text response");
  }

  // Parse the JSON response — strip markdown fences if present
  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  const rows: unknown[] = JSON.parse(jsonStr);
  return rows.map(validateRow);
}

function validateRow(raw: unknown): ExtractedRow {
  const obj = raw as Record<string, unknown>;
  return {
    rawName: String(obj.rawName || "Unknown"),
    suggestedInciName: obj.suggestedInciName ? String(obj.suggestedInciName) : undefined,
    concentrationPct:
      typeof obj.concentrationPct === "number" && obj.concentrationPct >= 0 && obj.concentrationPct <= 100
        ? obj.concentrationPct
        : undefined,
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0.5)),
    issues: Array.isArray(obj.issues) ? obj.issues.map(String) : [],
  };
}
