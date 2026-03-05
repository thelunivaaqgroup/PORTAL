/**
 * Auto SKU generator: LNV-0001, LNV-0002, etc.
 * Transaction-safe — reads highest skuCode within the same tx.
 */

const SKU_PREFIX = "LNV-";

export async function getNextSkuCode(
  tx: { product: { findFirst: (args: unknown) => Promise<{ skuCode: string } | null> } },
): Promise<string> {
  const latest = await tx.product.findFirst({
    where: { skuCode: { startsWith: SKU_PREFIX } },
    orderBy: { skuCode: "desc" },
    select: { skuCode: true },
  }) as { skuCode: string } | null;

  let nextNum = 1;
  if (latest) {
    const numPart = latest.skuCode.replace(SKU_PREFIX, "");
    const parsed = parseInt(numPart, 10);
    if (!isNaN(parsed)) {
      nextNum = parsed + 1;
    }
  }

  return `${SKU_PREFIX}${String(nextNum).padStart(4, "0")}`;
}
