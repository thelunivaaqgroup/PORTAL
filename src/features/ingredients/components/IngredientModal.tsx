import { useState, type FormEvent } from "react";
import Modal from "../../../components/Modal";
import Button from "../../../components/Button";
import Input from "../../../components/Input";
import type { Ingredient } from "../types";

type IngredientModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { inciName: string; casNumber: string | null; synonyms: string[] }) => void;
  loading?: boolean;
  ingredient?: Ingredient | null;
};

export default function IngredientModal({
  open,
  onClose,
  onSubmit,
  loading = false,
  ingredient,
}: IngredientModalProps) {
  // Use a key to reset form state when modal opens/ingredient changes
  const formKey = open ? (ingredient?.id ?? "create") : "closed";

  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <IngredientForm
          key={formKey}
          ingredient={ingredient ?? null}
          onSubmit={onSubmit}
          onClose={onClose}
          loading={loading}
        />
      )}
    </Modal>
  );
}

function IngredientForm({
  ingredient,
  onSubmit,
  onClose,
  loading,
}: {
  ingredient: Ingredient | null;
  onSubmit: (data: { inciName: string; casNumber: string | null; synonyms: string[] }) => void;
  onClose: () => void;
  loading: boolean;
}) {
  const isEdit = !!ingredient;
  const [inciName, setInciName] = useState(ingredient?.inciName ?? "");
  const [casNumber, setCasNumber] = useState(ingredient?.casNumber ?? "");
  const [synonymsText, setSynonymsText] = useState(ingredient?.synonyms.join(", ") ?? "");
  const [inciError, setInciError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!inciName.trim()) {
      setInciError("INCI Name is required");
      return;
    }
    setInciError("");

    const synonyms = parseSynonyms(synonymsText);

    onSubmit({
      inciName: inciName.trim(),
      casNumber: casNumber.trim() || null,
      synonyms,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">
        {isEdit ? "Edit Ingredient" : "Add Ingredient"}
      </h3>

      <Input
        label="INCI Name"
        value={inciName}
        onChange={(e) => setInciName(e.target.value)}
        error={inciError}
        placeholder="e.g. Aqua"
      />

      <Input
        label="CAS Number"
        value={casNumber}
        onChange={(e) => setCasNumber(e.target.value)}
        placeholder="e.g. 7732-18-5"
      />

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">
          Synonyms
        </label>
        <textarea
          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
          value={synonymsText}
          onChange={(e) => setSynonymsText(e.target.value)}
          placeholder="Comma-separated, e.g. Water, Purified Water, Deionized Water"
        />
        <p className="text-xs text-gray-500">Separate multiple synonyms with commas</p>
      </div>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onClose}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save" : "Create")}
        </Button>
      </div>
    </form>
  );
}

function parseSynonyms(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(",")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
