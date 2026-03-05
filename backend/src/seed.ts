import { prisma } from "./prisma.js";
import { env, validateEmailDomain } from "./env.js";
import { hashPassword } from "./auth/auth.service.js";
import { writeAuditLog } from "./audit/audit.service.js";
import { logger } from "./logger.js";
import { v4 as uuidv4 } from "uuid";

export async function seedSuperAdmin(): Promise<void> {
  const email = env.SUPER_ADMIN_EMAIL.toLowerCase().trim();

  if (!validateEmailDomain(email)) {
    throw new Error(`SUPER_ADMIN_EMAIL must be @${env.ALLOWED_EMAIL_DOMAIN}`);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    logger.info({ email }, "Super Admin already exists, skipping seed");
    return;
  }

  const passwordHash = await hashPassword(env.SUPER_ADMIN_PASSWORD);

  const user = await prisma.user.create({
    data: {
      email,
      fullName: env.SUPER_ADMIN_FULLNAME,
      role: "SUPER_ADMIN",
      passwordHash,
    },
  });

  await writeAuditLog({
    actorUserId: user.id,
    action: "SYSTEM_SUPERADMIN_SEEDED",
    entityType: "user",
    entityId: user.id,
    requestId: uuidv4(),
    metadata: { email },
  });

  logger.info({ email, id: user.id }, "Super Admin seeded successfully");
}
