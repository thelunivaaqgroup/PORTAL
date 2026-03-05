import { prisma } from "../prisma.js";
import type { DocumentType, ValidationStatus, RiskLevel } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export async function createFormulationWithDraftV1(skuId: string, createdById: string) {
  return prisma.$transaction(async (tx) => {
    const formulation = await tx.formulation.create({
      data: { skuId, createdById },
    });

    const version = await tx.formulationVersion.create({
      data: {
        formulationId: formulation.id,
        versionNumber: 1,
        status: "DRAFT",
        createdById,
      },
    });

    const updated = await tx.formulation.update({
      where: { id: formulation.id },
      data: { currentVersionId: version.id },
      include: {
        sku: true,
        currentVersion: true,
      },
    });

    return updated;
  });
}

export async function listFormulations() {
  return prisma.formulation.findMany({
    include: {
      sku: true,
      currentVersion: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getFormulationById(id: string) {
  return prisma.formulation.findUnique({
    where: { id },
    include: {
      sku: true,
      currentVersion: true,
      versions: {
        orderBy: { versionNumber: "desc" },
        include: {
          _count: {
            select: { ingredients: true, documents: true },
          },
        },
      },
    },
  });
}

export async function createNextVersion(formulationId: string, createdById: string) {
  return prisma.$transaction(async (tx) => {
    const maxVersion = await tx.formulationVersion.findFirst({
      where: { formulationId },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });

    const nextNumber = (maxVersion?.versionNumber ?? 0) + 1;

    const version = await tx.formulationVersion.create({
      data: {
        formulationId,
        versionNumber: nextNumber,
        status: "DRAFT",
        createdById,
      },
    });

    await tx.formulation.update({
      where: { id: formulationId },
      data: { currentVersionId: version.id },
    });

    return version;
  });
}

export async function getVersionById(versionId: string) {
  return prisma.formulationVersion.findUnique({
    where: { id: versionId },
    include: {
      ingredients: true,
      documents: true,
      formulation: { include: { sku: true } },
    },
  });
}

export async function addIngredient(
  versionId: string,
  ingredientName: string,
  fn: string,
  concentrationPct: number,
) {
  return prisma.formulationIngredient.create({
    data: {
      versionId,
      ingredientName,
      function: fn,
      concentrationPct,
    },
  });
}

export async function listIngredients(versionId: string) {
  return prisma.formulationIngredient.findMany({
    where: { versionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function addDocument(
  versionId: string,
  type: DocumentType,
  fileName: string,
  url: string,
) {
  return prisma.document.create({
    data: { versionId, type, fileName, url },
  });
}

export async function listDocuments(versionId: string) {
  return prisma.document.findMany({
    where: { versionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function submitVersion(versionId: string, submittedById: string) {
  return prisma.formulationVersion.update({
    where: { id: versionId },
    data: {
      status: "IN_REVIEW",
      submittedById,
      submittedAt: new Date(),
    },
  });
}

export async function approveVersion(versionId: string, approvedById: string) {
  return prisma.formulationVersion.update({
    where: { id: versionId },
    data: {
      status: "APPROVED",
      approvedById,
      approvedAt: new Date(),
    },
  });
}

export async function rejectVersion(versionId: string, rejectedById: string, reason: string) {
  return prisma.formulationVersion.update({
    where: { id: versionId },
    data: {
      status: "REJECTED",
      rejectedById,
      rejectedAt: new Date(),
      rejectionReason: reason,
    },
  });
}

// ─── Stage 3A — Validation ─────────────────────────────────

const REQUIRED_DOC_TYPES: DocumentType[] = ["COA", "MSDS", "INGREDIENT_DATASHEET"];

function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export interface ValidationResult {
  totalPct: Decimal;
  hasDuplicateIngredients: boolean;
  missingDocTypes: DocumentType[];
  validationStatus: ValidationStatus;
  riskLevel: RiskLevel;
}

export async function validateVersion(versionId: string): Promise<ValidationResult> {
  const ingredients = await prisma.formulationIngredient.findMany({
    where: { versionId },
  });

  const documents = await prisma.document.findMany({
    where: { versionId },
  });

  // 1. Total concentration
  const totalPct = ingredients.reduce(
    (sum, ing) => sum.add(ing.concentrationPct),
    new Decimal(0),
  );

  // 2. Duplicate ingredients (normalized name)
  const seen = new Set<string>();
  let hasDuplicateIngredients = false;
  for (const ing of ingredients) {
    const key = normalizeIngredientName(ing.ingredientName);
    if (seen.has(key)) {
      hasDuplicateIngredients = true;
      break;
    }
    seen.add(key);
  }

  // 3. Missing required doc types
  const presentTypes = new Set(documents.map((d) => d.type));
  const missingDocTypes = REQUIRED_DOC_TYPES.filter((t) => !presentTypes.has(t));

  // 4. Derive validation status
  const totalPass = totalPct.equals(new Decimal("100"));
  const validationStatus: ValidationStatus =
    totalPass && !hasDuplicateIngredients && missingDocTypes.length === 0
      ? "PASS"
      : "FAIL";

  // 5. Risk level
  let riskLevel: RiskLevel = "LOW";
  if (validationStatus === "FAIL") {
    const failCount =
      (totalPass ? 0 : 1) +
      (hasDuplicateIngredients ? 1 : 0) +
      (missingDocTypes.length > 0 ? 1 : 0);
    riskLevel = failCount >= 2 ? "HIGH" : "MEDIUM";
  }

  // 6. Persist validation results
  await prisma.formulationVersion.update({
    where: { id: versionId },
    data: {
      totalPct,
      hasDuplicateIngredients,
      missingDocTypes,
      validationStatus,
      riskLevel,
      validatedAt: new Date(),
    },
  });

  return { totalPct, hasDuplicateIngredients, missingDocTypes, validationStatus, riskLevel };
}
