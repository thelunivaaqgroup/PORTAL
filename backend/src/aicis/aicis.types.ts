export interface ImportSnapshotInput {
  regionCode: string;
  versionName?: string;
  fileBuffer: Buffer;
  originalFilename: string;
  actorUserId: string;
  requestId?: string;
  notes?: string;
}

export interface SnapshotSummary {
  snapshotId: string;
  versionName: string;
  regionCode: string;
  rowCount: number;
  isActive: boolean;
  importedAt: Date;
  sourceFilename: string;
  fileSha256: string;
}

export interface ActiveSnapshotResponse {
  active: boolean;
  snapshot: {
    id: string;
    versionName: string;
    regionCode: string;
    sourceFileName: string;
    fileSha256: string;
    rowCount: number;
    isActive: boolean;
    importedAt: Date;
    importedBy: { id: string; fullName: string; email: string } | null;
    chemicalCount: number;
  } | null;
}
