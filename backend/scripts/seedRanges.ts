import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ranges = ["Aloe Vera Range", "Ashwagandha Range"];

  for (const name of ranges) {
    const range = await prisma.productRange.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`Upserted range: ${range.name} (${range.id})`);
  }

  console.log("Done! Ranges seeded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
