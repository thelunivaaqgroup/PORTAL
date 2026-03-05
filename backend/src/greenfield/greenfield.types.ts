export interface CreateGreenfieldBody {
  title: string;
  conceptNotes?: string;
  targetAudience?: string;
  ingredientsVision?: string;
  marketPositioning?: string;
  additionalNotes?: string;
}

export interface UpdateGreenfieldBody {
  title?: string;
  conceptNotes?: string | null;
  targetAudience?: string | null;
  ingredientsVision?: string | null;
  marketPositioning?: string | null;
  additionalNotes?: string | null;
}

export interface ConvertGreenfieldBody {
  productName: string;
  rangeId: string;
  brand?: string;
}
