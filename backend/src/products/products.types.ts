export interface CreateProductBody {
  name: string;
  rangeId: string;
  productLine?: string;
  brand?: string;
  targetRegions: string[];
}

export interface UpdateProductBody {
  name?: string;
  rangeId?: string;
  productLine?: string;
  targetRegions?: string[];
  brand?: string | null;
}
