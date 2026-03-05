import { useState, type FormEvent } from "react";
import { useRanges } from "../../products/hooks/useProductsApi";
import Modal from "../../../components/Modal";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import type { GreenfieldIdea, ConvertGreenfieldPayload } from "../types";

type Props = {
  idea: GreenfieldIdea | null;
  loading: boolean;
  onClose: () => void;
  onConvert: (id: string, body: ConvertGreenfieldPayload) => void;
};

export default function ConvertModal({ idea, loading, onClose, onConvert }: Props) {
  return (
    <Modal open={!!idea} onClose={onClose}>
      {idea && (
        <ConvertForm idea={idea} loading={loading} onClose={onClose} onConvert={onConvert} />
      )}
    </Modal>
  );
}

function ConvertForm({
  idea,
  loading,
  onClose,
  onConvert,
}: {
  idea: GreenfieldIdea;
  loading: boolean;
  onClose: () => void;
  onConvert: (id: string, body: ConvertGreenfieldPayload) => void;
}) {
  const { data: rangesData, isLoading: rangesLoading } = useRanges();
  const ranges = rangesData?.ranges ?? [];

  const [productName, setProductName] = useState(idea.title);
  const [rangeId, setRangeId] = useState("");
  const [brand, setBrand] = useState("Natureaallyy");
  const [nameError, setNameError] = useState("");
  const [rangeError, setRangeError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let valid = true;

    if (!productName.trim()) {
      setNameError("Product name is required");
      valid = false;
    } else {
      setNameError("");
    }

    if (!rangeId) {
      setRangeError("Range is required");
      valid = false;
    } else {
      setRangeError("");
    }

    if (!valid) return;

    onConvert(idea.id, {
      productName: productName.trim(),
      rangeId,
      brand: brand.trim() || undefined,
    });
  }

  const selectCls =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Convert to Product</h3>
      <p className="text-sm text-gray-500">
        This will create a new product from the idea "{idea.title}".
      </p>

      <Input
        label="Product Name"
        value={productName}
        onChange={(e) => setProductName(e.target.value)}
        error={nameError}
        placeholder="Product name"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Range (Folder)</label>
        {rangesLoading ? (
          <p className="text-sm text-gray-400">Loading ranges...</p>
        ) : (
          <select
            className={selectCls}
            value={rangeId}
            onChange={(e) => { setRangeId(e.target.value); setRangeError(""); }}
          >
            <option value="">Select range...</option>
            {ranges.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        )}
        {rangeError && <p className="mt-1 text-sm text-red-600">{rangeError}</p>}
      </div>

      <Input
        label="Brand"
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        placeholder="e.g. Natureaallyy"
      />

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Converting..." : "Convert"}
        </Button>
      </div>
    </form>
  );
}
