export interface SaveLabelBody {
  region: "IN" | "AU";
  productName: string;
  netQuantity: string;
  inciDeclaration: string;
  warnings?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  batchFormat?: string;
  mfgDate?: string;
  expDate?: string;
}

export interface LabelValidationResult {
  isValid: boolean;
  errors: string[];
}
