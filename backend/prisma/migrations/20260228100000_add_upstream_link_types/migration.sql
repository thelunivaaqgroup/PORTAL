-- Add upstream treaty source link types to BannedRestrictedLinkType enum
ALTER TYPE "BannedRestrictedLinkType" ADD VALUE IF NOT EXISTS 'ROTTERDAM_PIC';
ALTER TYPE "BannedRestrictedLinkType" ADD VALUE IF NOT EXISTS 'STOCKHOLM_POP';
ALTER TYPE "BannedRestrictedLinkType" ADD VALUE IF NOT EXISTS 'MINAMATA_TREATY';
