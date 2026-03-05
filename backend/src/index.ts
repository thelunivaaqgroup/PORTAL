import "dotenv/config";
import { env } from "./env.js";
import { app } from "./app.js";
import { prisma } from "./prisma.js";
import { logger } from "./logger.js";
import { seedSuperAdmin } from "./seed.js";
import { scheduleAlertsSweep } from "./alerts/alerts.scheduler.js";

async function main() {
  // Connect to database
  await prisma.$connect();
  logger.info("Database connected");

  // Seed super admin
  await seedSuperAdmin();

  // Start server
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server started");
    scheduleAlertsSweep("startup");
  });
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
