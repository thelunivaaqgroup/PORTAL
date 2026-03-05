import { useState } from "react";
import Modal from "../../../components/Modal";
import Button from "../../../components/Button";
import type { BulkUploadResult } from "../types";

type BulkUploadModalProps = {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File) => void;
  loading: boolean;
  result?: BulkUploadResult | null;
};

export default function BulkUploadModal({ open, onClose, onUpload, loading, result }: BulkUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFile) onUpload(selectedFile);
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Bulk Upload Lots (CSV)</h2>

        <p className="text-xs text-gray-500">
          CSV columns: IngredientInciName, SupplierName, SupplierLotNumber, QuantityKg, ExpiryDate (optional)
        </p>

        {!result ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">CSV File *</label>
              <input
                type="file"
                accept=".csv"
                className={inputCls}
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={loading || !selectedFile}>
                {loading ? "Uploading..." : "Upload"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-4">
              <div className="rounded-lg bg-green-50 px-4 py-2 text-sm">
                <span className="font-semibold text-green-700">{result.createdCount}</span>{" "}
                <span className="text-green-600">created</span>
              </div>
              {result.failedCount > 0 && (
                <div className="rounded-lg bg-red-50 px-4 py-2 text-sm">
                  <span className="font-semibold text-red-700">{result.failedCount}</span>{" "}
                  <span className="text-red-600">failed</span>
                </div>
              )}
            </div>

            {result.failures.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Failures:</p>
                {result.failures.map((f, i) => (
                  <p key={i} className="text-xs text-red-600">
                    Row {f.rowNumber}: {f.reason}
                  </p>
                ))}
              </div>
            )}

            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
