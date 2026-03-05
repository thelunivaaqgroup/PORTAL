import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Resetting all product data...");

  // Delete in FK-safe order
  const fgLots = await prisma.finishedGoodLot.deleteMany({});
  console.log(`  FinishedGoodLot: ${fgLots.count} deleted`);

  const batchConsumptions = await prisma.batchConsumption.deleteMany({});
  console.log(`  BatchConsumption: ${batchConsumptions.count} deleted`);

  const batches = await prisma.batch.deleteMany({});
  console.log(`  Batch: ${batches.count} deleted`);

  const productDocs = await prisma.productDocument.deleteMany({});
  console.log(`  ProductDocument: ${productDocs.count} deleted`);

  const labels = await prisma.labelMetadata.deleteMany({});
  console.log(`  LabelMetadata: ${labels.count} deleted`);

  const stageEvents = await prisma.productStageEvent.deleteMany({});
  console.log(`  ProductStageEvent: ${stageEvents.count} deleted`);

  const ideations = await prisma.productIdeation.deleteMany({});
  console.log(`  ProductIdeation: ${ideations.count} deleted`);

  const alerts = await prisma.systemAlert.deleteMany({ where: { productId: { not: null } } });
  console.log(`  SystemAlert (product-linked): ${alerts.count} deleted`);

  const products = await prisma.product.deleteMany({});
  console.log(`  Product: ${products.count} deleted`);

  // Also clean up the old ProductCategory table if it exists
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "product_categories"`);
    console.log("  ProductCategory: cleaned up");
  } catch {
    // table may not exist
  }

  console.log("Done! All product data has been reset.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
