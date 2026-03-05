export type FinishedGoodLotStatus = "AVAILABLE" | "EXHAUSTED";

export type FinishedGoodLot = {
  id: string;
  productId: string;
  batchId: string;
  unitsProduced: number;
  unitsRemaining: number;
  packNetContentMl: number;
  fillDensityGPerMl: number;
  totalFillableMl: number;
  leftoverMl: number;
  status: FinishedGoodLotStatus;
  createdAt: string;
  createdByUserId: string;
  batch: {
    id: string;
    batchNumber: string;
    status: string;
    productionQuantityKg: number;
    manufacturingDate: string;
    expiryDate: string;
  };
};

export type FinishedGoodsSummary = {
  productId: string;
  totalUnitsProduced: number;
  totalUnitsRemaining: number;
  lotsAvailableCount: number;
};

export type PackSpecPayload = {
  packNetContentMl: number;
  fillDensityGPerMl: number;
};
