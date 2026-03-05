import { prisma } from "../prisma.js";
import type { IngredientDTO, CreateIngredientBody, UpdateIngredientBody } from "./ingredients.types.js";

function toDTO(row: {
  id: string;
  inciName: string;
  casNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  synonyms: { name: string }[];
}): IngredientDTO {
  return {
    id: row.id,
    inciName: row.inciName,
    casNumber: row.casNumber,
    synonyms: row.synonyms.map((s) => s.name),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dedupeSynonyms(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of names) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export async function listIngredients(): Promise<IngredientDTO[]> {
  const rows = await prisma.ingredientMaster.findMany({
    orderBy: { updatedAt: "desc" },
    include: { synonyms: { select: { name: true } } },
  });
  return rows.map(toDTO);
}

export async function createIngredient(
  userId: string,
  body: CreateIngredientBody,
): Promise<IngredientDTO> {
  const inciName = body.inciName.trim();
  const synonyms = dedupeSynonyms(body.synonyms ?? []);

  const result = await prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredientMaster.create({
      data: {
        inciName,
        casNumber: body.casNumber?.trim() || null,
        createdByUserId: userId,
      },
    });

    if (synonyms.length > 0) {
      await tx.ingredientSynonym.createMany({
        data: synonyms.map((name) => ({
          ingredientId: ingredient.id,
          name,
        })),
      });
    }

    return tx.ingredientMaster.findUniqueOrThrow({
      where: { id: ingredient.id },
      include: { synonyms: { select: { name: true } } },
    });
  });

  return toDTO(result);
}

export async function updateIngredient(
  userId: string,
  id: string,
  body: UpdateIngredientBody,
): Promise<IngredientDTO> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.ingredientMaster.findUnique({ where: { id } });
    if (!existing) throw new Error("NOT_FOUND");

    const updateData: Record<string, unknown> = { updatedByUserId: userId };
    if (body.inciName !== undefined) updateData.inciName = body.inciName.trim();
    if (body.casNumber !== undefined) updateData.casNumber = body.casNumber?.trim() || null;

    await tx.ingredientMaster.update({ where: { id }, data: updateData });

    if (body.synonyms !== undefined) {
      await tx.ingredientSynonym.deleteMany({ where: { ingredientId: id } });
      const synonyms = dedupeSynonyms(body.synonyms);
      if (synonyms.length > 0) {
        await tx.ingredientSynonym.createMany({
          data: synonyms.map((name) => ({
            ingredientId: id,
            name,
          })),
        });
      }
    }

    return tx.ingredientMaster.findUniqueOrThrow({
      where: { id },
      include: { synonyms: { select: { name: true } } },
    });
  });

  return toDTO(result);
}

export async function deleteIngredient(id: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ingredientMaster.findUnique({ where: { id } });
    if (!existing) throw new Error("NOT_FOUND");

    await tx.ingredientSynonym.deleteMany({ where: { ingredientId: id } });
    await tx.ingredientMaster.delete({ where: { id } });
  });
}
