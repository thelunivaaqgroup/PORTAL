export interface SaveIdeationBody {
  conceptNotes?: string | null;
  targetAudience?: string | null;
  ingredientsVision?: string | null;
  marketPositioning?: string | null;
  competitorLinks?: Array<{ label: string; url: string }> | null;
  additionalNotes?: string | null;
}

export interface IdeationDTO {
  id: string;
  productId: string;
  conceptNotes: string | null;
  targetAudience: string | null;
  ingredientsVision: string | null;
  marketPositioning: string | null;
  competitorLinksJson: unknown;
  additionalNotes: string | null;
  versionNumber: number;
  isActive: boolean;
  createdAt: Date;
  createdBy: { id: string; fullName: string };
}
