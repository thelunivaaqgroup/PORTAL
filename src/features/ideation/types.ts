export type CompetitorLink = {
  label: string;
  url: string;
};

export type IdeationVersion = {
  id: string;
  productId: string;
  conceptNotes: string | null;
  targetAudience: string | null;
  ingredientsVision: string | null;
  marketPositioning: string | null;
  competitorLinksJson: CompetitorLink[] | null;
  additionalNotes: string | null;
  versionNumber: number;
  isActive: boolean;
  createdAt: string;
  createdBy: { id: string; fullName: string };
};

export type SaveIdeationPayload = {
  conceptNotes?: string | null;
  targetAudience?: string | null;
  ingredientsVision?: string | null;
  marketPositioning?: string | null;
  competitorLinks?: CompetitorLink[] | null;
  additionalNotes?: string | null;
};
