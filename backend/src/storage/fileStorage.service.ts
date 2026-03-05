import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const UPLOAD_ROOT = join(process.cwd(), "uploads");

export interface StoredFile {
  storedFilename: string;
  filePath: string;
  sizeBytes: number;
}

/**
 * Save an uploaded file buffer to disk under uploads/YYYY/MM/.
 * Returns metadata about the stored file.
 */
export async function saveUploadedFile(
  fileBuffer: Buffer,
  originalName: string,
): Promise<StoredFile> {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dir = join(UPLOAD_ROOT, yyyy, mm);

  await mkdir(dir, { recursive: true });

  // Sanitize: keep only alphanumeric, dots, hyphens, underscores
  const sanitized = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const unique = randomBytes(8).toString("hex");
  const storedFilename = `${unique}-${sanitized}`;
  const filePath = join(dir, storedFilename);

  await writeFile(filePath, fileBuffer);

  return {
    storedFilename,
    filePath,
    sizeBytes: fileBuffer.length,
  };
}
