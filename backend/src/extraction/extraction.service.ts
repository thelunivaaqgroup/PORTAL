import { prisma } from "../prisma.js";
import { parseFile } from "./file-parser.js";
import { extractWithAI } from "./ai-extractor.js";
import { validateVersion } from "../formulations/formulations.service.js";
import type { ExtractedRow, ModeHint } from "./extraction.types.js";
import type { Prisma } from "@prisma/client";

/**
 * Run the full extraction pipeline: parse file → AI extract → save rows → mark DONE.
 * Synchronous (no background queues). Returns the completed job.
 */
export async function runExtraction(jobId: string) {
  const job = await prisma.extractionJob.update({
    where: { id: jobId },
    data: { status: "RUNNING", startedAt: new Date() },
    include: { file: true },
  });

  try {
    // 1. Parse file
    const parsed = await parseFile(job.file.storagePath, job.file.mimeType);

    // 2. AI extraction
    const rows = await extractWithAI(parsed);

    // 3. Save extracted ingredients
    await prisma.extractedIngredient.createMany({
      data: rows.map((row) => ({
        jobId: job.id,
        rawName: row.rawName,
        suggestedInciName: row.suggestedInciName ?? null,
        concentrationPct: row.concentrationPct ?? null,
        confidence: row.confidence,
        issues: row.issues,
      })),
    });

    // 4. Mark DONE
    const completed = await prisma.extractionJob.update({
      where: { id: job.id },
      data: { status: "DONE", completedAt: new Date() },
      include: { extractedIngredients: true, file: true },
    });

    return completed;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown extraction error";
    await prisma.extractionJob.update({
      where: { id: job.id },
      data: { status: "FAILED", failReason: reason, completedAt: new Date() },
    });
    throw err;
  }
}

/**
 * Get the latest extraction job for a version.
 */
export async function getLatestExtractionJob(versionId: string) {
  return prisma.extractionJob.findFirst({
    where: { versionId },
    orderBy: { createdAt: "desc" },
    include: {
      extractedIngredients: { orderBy: { createdAt: "asc" } },
      file: true,
    },
  });
}

/**
 * Apply extracted ingredients to the version.
 * REPLACE: delete all existing ingredients, insert extracted.
 * APPEND: insert only non-duplicate (by normalized rawName).
 * Then run validateVersion and return results.
 */
export async function applyExtraction(
  jobId: string,
  versionId: string,
  mode: ModeHint,
) {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: { extractedIngredients: true },
  });

  if (!job) throw new Error("Job not found");
  if (job.status !== "DONE") throw new Error("Job is not in DONE status");
  if (job.versionId !== versionId) throw new Error("Job does not belong to this version");

  const rows = job.extractedIngredients;

  if (mode === "REPLACE") {
    await prisma.$transaction(async (tx) => {
      // Delete all existing ingredients for this version
      await tx.formulationIngredient.deleteMany({ where: { versionId } });

      // Insert extracted rows
      await tx.formulationIngredient.createMany({
        data: rows.map((row) => ({
          versionId,
          ingredientName: row.rawName,
          function: row.suggestedInciName || "Extracted",
          concentrationPct: row.concentrationPct ?? 0,
        })),
      });
    });
  } else {
    // APPEND — skip duplicates by normalized name
    const existing = await prisma.formulationIngredient.findMany({ where: { versionId } });
    const existingNames = new Set(
      existing.map((i) => i.ingredientName.trim().toLowerCase().replace(/\s+/g, " ")),
    );

    const newRows = rows.filter((row) => {
      const norm = row.rawName.trim().toLowerCase().replace(/\s+/g, " ");
      return !existingNames.has(norm);
    });

    if (newRows.length > 0) {
      await prisma.formulationIngredient.createMany({
        data: newRows.map((row) => ({
          versionId,
          ingredientName: row.rawName,
          function: row.suggestedInciName || "Extracted",
          concentrationPct: row.concentrationPct ?? 0,
        })),
      });
    }
  }

  // Run validation (Stage 3A)
  const validation = await validateVersion(versionId);

  const finalIngredients = await prisma.formulationIngredient.findMany({
    where: { versionId },
    orderBy: { createdAt: "asc" },
  });

  return {
    mode,
    appliedCount: mode === "REPLACE" ? rows.length : rows.length,
    totalIngredients: finalIngredients.length,
    validation,
  };
}
