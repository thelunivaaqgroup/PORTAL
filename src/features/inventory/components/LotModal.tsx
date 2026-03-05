import { useState } from "react";
import Modal from "../../../components/Modal";
import Button from "../../../components/Button";
import { useIngredientsQuery } from "../../ingredients/hooks/useIngredientsApi";
import type { RawMaterialLot, CreateLotPayload, UpdateLotPayload } from "../types";

type LotModalProps = {
  open: boolean;
  onClose: () => void;
  onCreateSubmit?: (data: CreateLotPayload) => void;
  onEditSubmit?: (data: UpdateLotPayload) => void;
  loading?: boolean;
  lot?: RawMaterialLot | null;
};

export default function LotModal({ open, onClose, onCreateSubmit, onEditSubmit, loading, lot }: LotModalProps) {
  const isEdit = !!lot;
  const { data: ingredientsData } = useIngredientsQuery();
  const ingredients = ingredientsData?.ingredients ?? [];

  const [ingredientId, setIngredientId] = useState(lot?.ingredientId ?? "");
  const [supplierName, setSupplierName] = useState(lot?.supplierName ?? "");
  const [supplierLotNumber, setSupplierLotNumber] = useState(lot?.supplierLotNumber ?? "");
  const [quantityReceivedKg, setQuantityReceivedKg] = useState(lot?.quantityReceivedKg?.toString() ?? "");
  const [expiryDate, setExpiryDate] = useState(lot?.expiryDate?.slice(0, 10) ?? "");
  const [status, setStatus] = useState<"AVAILABLE" | "BLOCKED">(
    lot?.status === "BLOCKED" ? "BLOCKED" : "AVAILABLE",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isEdit && onEditSubmit) {
      onEditSubmit({
        supplierName: supplierName.trim(),
        supplierLotNumber: supplierLotNumber.trim(),
        expiryDate: expiryDate || null,
        status,
      });
    } else if (onCreateSubmit) {
      onCreateSubmit({
        ingredientId,
        supplierName: supplierName.trim(),
        supplierLotNumber: supplierLotNumber.trim(),
        quantityReceivedKg: Number(quantityReceivedKg),
        ...(expiryDate && { expiryDate }),
      });
    }
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <Modal open={open} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEdit ? "Edit Lot" : "Add Raw Material Lot"}
        </h2>

        {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ingredient *</label>
            <select className={inputCls} value={ingredientId} onChange={(e) => setIngredientId(e.target.value)} required>
              <option value="">Select ingredient...</option>
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>{ing.inciName}</option>
              ))}
            </select>
          </div>
        )}

        {isEdit && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ingredient</label>
            <p className="text-sm text-gray-900">{lot?.ingredient.inciName}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Name *</label>
            <input className={inputCls} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Supplier Lot # *</label>
            <input className={inputCls} value={supplierLotNumber} onChange={(e) => setSupplierLotNumber(e.target.value)} required />
          </div>
        </div>

        {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity Received (kg) *</label>
            <input type="number" step="0.001" min="0.001" className={inputCls} value={quantityReceivedKg} onChange={(e) => setQuantityReceivedKg(e.target.value)} required />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Expiry Date</label>
            <input type="date" className={inputCls} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          {isEdit && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
              <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as "AVAILABLE" | "BLOCKED")}>
                <option value="AVAILABLE">Available</option>
                <option value="BLOCKED">Blocked</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={loading || (!isEdit && (!ingredientId || !supplierName.trim() || !supplierLotNumber.trim() || !quantityReceivedKg))}>
            {loading ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save" : "Create")}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </form>
    </Modal>
  );
}
