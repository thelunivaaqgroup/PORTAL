export type BatchStatus = "CREATED" | "RELEASED";

export type Batch = {
  id: string;
  batchNumber: string;
  productionQuantityKg: number;
  manufacturingDate: string;
  expiryDate: string;
  status: BatchStatus;
  createdAt: string;
  createdBy: { id: string; fullName: string };
  formulationVersion?: { id: string; versionNumber: number };
};

export type MaxProducibleResult = {
  maxProducibleKg: number;
};
