import { useState, useRef, useEffect } from "react";
import { Card, CardBody } from "../../../components/Card";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import { useToast } from "../../../context/useToast";
import {
  useUnmatchedRows,
  useIngredientSearch,
  useResolveIngredient,
  useUploadEvidence,
  useAutoResolve,
} from "../hooks/useComplianceApi";
import type {
  UnmatchedRow,
  IngredientType,
  IngredientSearchResult,
} from "../types";

const INGREDIENT_TYPES: { value: IngredientType; label: string }[] = [
  { value: "STANDARD", label: "Standard" },
  { value: "BOTANICAL", label: "Botanical" },
  { value: "BLEND", label: "Blend" },
  { value: "POLYMER", label: "Polymer" },
  { value: "TRADE_NAME", label: "Trade Name" },
];

const DOC_TYPES = ["SDS", "COA", "TDS", "SPEC_SHEET", "SUPPLIER_DECLARATION", "OTHER"];

const CATEGORY_BADGE: Record<string, "neutral" | "warning" | "success" | "error"> = {
  STANDARD: "neutral",
  BOTANICAL: "warning",
  BLEND: "warning",
  POLYMER: "warning",
  TRADE_NAME: "neutral",
};

type ResolveModalState = {
  row: UnmatchedRow;
} | null;

export default function ResolveIngredientsPanel({
  requestId,
  productId,
  requestStatus,
}: {
  requestId: string;
  productId: string;
  requestStatus: string;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useUnmatchedRows(requestId);
  const resolveMutation = useResolveIngredient(productId);
  const evidenceMutation = useUploadEvidence();
  const autoResolveMutation = useAutoResolve(productId);

  const [resolveModal, setResolveModal] = useState<ResolveModalState>(null);

  function handleAutoResolve() {
    toast("success", "Auto-resolving unmatched ingredients...");
    autoResolveMutation.mutate(
      { requestId },
      {
        onSuccess: (result) => {
          const parts: string[] = [];
          if (result.resolved > 0) parts.push(`${result.resolved} resolved`);
          if (result.createdMasters > 0) parts.push(`${result.createdMasters} new masters created`);
          if (result.skippedMissingCas > 0) parts.push(`${result.skippedMissingCas} skipped (no CAS)`);
          if (result.errors.length > 0) parts.push(`${result.errors.length} errors`);
          toast("success", `Auto-resolve complete: ${parts.join(", ")}`);
        },
        onError: (err) => {
          toast("error", err instanceof Error ? err.message : "Auto-resolve failed");
        },
      },
    );
  }

  const rows = data?.rows ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-500">Loading unmatched ingredients...</p>
        </CardBody>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Resolve Ingredients</h3>
          <p className="text-sm text-green-600">All ingredients are matched. No resolution needed.</p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Resolve Ingredients ({rows.length} unmatched)
            </h3>
            <Button
              size="sm"
              onClick={handleAutoResolve}
              disabled={autoResolveMutation.isPending || requestStatus === "APPROVED"}
            >
              {autoResolveMutation.isPending ? "Auto-resolving..." : "Auto-Resolve Unmatched"}
            </Button>
          </div>
          <p className="text-xs text-gray-500">
            Match each unmatched ingredient to an existing INCI record or create a new one.
            Resolved ingredients are automatically saved as synonyms for future uploads.
          </p>

          <div className="divide-y divide-gray-200">
            {rows.map((row) => (
              <div
                key={row.id}
                className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {row.rawName}
                    </span>
                    <Badge variant={CATEGORY_BADGE[row.inferredCategory] ?? "neutral"}>
                      {row.inferredCategory}
                    </Badge>
                    {row.casNumber && (
                      <span className="text-xs text-gray-500 font-mono">
                        CAS: {row.casNumber}
                      </span>
                    )}
                  </div>
                  {row.inciSuggestion && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Suggestion: {row.inciSuggestion}
                    </p>
                  )}
                  {row.evidenceDocs.length > 0 && (
                    <p className="text-xs text-green-600 mt-0.5">
                      {row.evidenceDocs.length} evidence doc(s) attached
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={() => setResolveModal({ row })}
                  disabled={requestStatus === "APPROVED"}
                >
                  Resolve
                </Button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {resolveModal && (
        <ResolveModal
          row={resolveModal.row}
          requestId={requestId}
          productId={productId}
          onClose={() => setResolveModal(null)}
          resolveMutation={resolveMutation}
          evidenceMutation={evidenceMutation}
          toast={toast}
        />
      )}
    </>
  );
}

// ── Resolve Modal ──

function ResolveModal({
  row,
  requestId,
  productId,
  onClose,
  resolveMutation,
  evidenceMutation,
  toast,
}: {
  row: UnmatchedRow;
  requestId: string;
  productId: string;
  onClose: () => void;
  resolveMutation: ReturnType<typeof useResolveIngredient>;
  evidenceMutation: ReturnType<typeof useUploadEvidence>;
  toast: (type: "success" | "error", msg: string) => void;
}) {
  const [mode, setMode] = useState<"existing" | "create">("existing");
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientSearchResult | null>(null);
  const [ingredientType, setIngredientType] = useState<IngredientType>(
    (row.ingredientType as IngredientType) || (row.inferredCategory as IngredientType) || "STANDARD",
  );
  const [addSynonym, setAddSynonym] = useState(true);
  const [casNumber, setCasNumber] = useState(row.casNumber || "");
  const [newInciName, setNewInciName] = useState("");
  const [newSynonyms, setNewSynonyms] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceDocType, setEvidenceDocType] = useState("SDS");
  const [validationError, setValidationError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleResolve() {
    if (mode === "existing" && !selectedIngredient) {
      setValidationError("Select an existing ingredient from the dropdown.");
      return;
    }
    if (mode === "create" && !newInciName.trim()) {
      toast("error", "Enter an INCI name for the new ingredient.");
      return;
    }
    setValidationError("");

    // Upload evidence first if provided
    let evidenceDocIds: string[] = [];
    if (evidenceFile) {
      try {
        const res = await evidenceMutation.mutateAsync({
          uploadRowId: row.id,
          file: evidenceFile,
          docType: evidenceDocType,
        });
        evidenceDocIds = [res.doc.id];
      } catch {
        toast("error", "Failed to upload evidence document.");
        return;
      }
    }

    resolveMutation.mutate(
      {
        requestId,
        uploadRowId: row.id,
        ingredientMasterId: mode === "existing" ? selectedIngredient!.id : undefined,
        createPayload: mode === "create"
          ? {
              inciName: newInciName.trim(),
              casNumber: casNumber.trim() || null,
              synonyms: newSynonyms
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            }
          : undefined,
        addSynonym,
        ingredientType,
        casNumber: casNumber.trim() || null,
        evidenceDocIds,
      },
      {
        onSuccess: (res) => {
          toast(
            "success",
            `Resolved "${row.rawName}" → "${res.result.matchedInciName}"${res.result.synonymAdded ? " (synonym saved)" : ""}`,
          );
          onClose();
        },
        onError: (err) => {
          toast("error", err instanceof Error ? err.message : "Resolution failed");
        },
      },
    );
  }

  return (
    <Modal open onClose={onClose}>
      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-semibold text-gray-900">
          Resolve: {row.rawName}
        </h3>

        {row.casNumber && (
          <p className="text-xs text-gray-500 font-mono">CAS: {row.casNumber}</p>
        )}

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("existing")}
            className={`px-3 py-1 text-xs rounded-full border ${
              mode === "existing"
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-300 text-gray-600"
            }`}
          >
            Match existing
          </button>
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`px-3 py-1 text-xs rounded-full border ${
              mode === "create"
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-300 text-gray-600"
            }`}
          >
            Create new
          </button>
        </div>

        {mode === "existing" ? (
          <ExistingIngredientPicker
            initialQuery={row.inciSuggestion || row.rawName || ""}
            selectedIngredient={selectedIngredient}
            onSelect={(ingredient) => {
              setSelectedIngredient(ingredient);
              setValidationError("");
              // Pre-fill CAS from master if row doesn't already have one
              if (ingredient?.casNumber && !casNumber.trim()) {
                setCasNumber(ingredient.casNumber);
              }
            }}
            validationError={validationError}
          />
        ) : (
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-700">
              INCI Name
            </label>
            <input
              type="text"
              value={newInciName}
              onChange={(e) => setNewInciName(e.target.value)}
              placeholder="e.g., Aqua, Glycerin, Cetearyl Alcohol"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <label className="block text-xs font-medium text-gray-700">
              Synonyms (comma-separated)
            </label>
            <input
              type="text"
              value={newSynonyms}
              onChange={(e) => setNewSynonyms(e.target.value)}
              placeholder="e.g., Water, Purified Water"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}

        {/* Ingredient type selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Ingredient Type
          </label>
          <div className="flex flex-wrap gap-1.5">
            {INGREDIENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setIngredientType(t.value)}
                className={`px-2.5 py-1 text-xs rounded border ${
                  ingredientType === t.value
                    ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* CAS number */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            CAS Number
          </label>
          <input
            type="text"
            value={casNumber}
            onChange={(e) => setCasNumber(e.target.value)}
            placeholder="e.g., 56-81-5"
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Add synonym toggle */}
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={addSynonym}
            onChange={(e) => setAddSynonym(e.target.checked)}
            className="rounded border-gray-300"
          />
          Save &quot;{row.rawName}&quot; as synonym for future auto-matching
        </label>

        {/* Evidence upload */}
        <div className="border-t border-gray-200 pt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Evidence Document (optional)
          </label>
          <div className="flex items-center gap-2">
            <select
              value={evidenceDocType}
              onChange={(e) => setEvidenceDocType(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {DOC_TYPES.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)}
              className="text-xs"
            />
          </div>
          {evidenceFile && (
            <p className="text-xs text-gray-500 mt-1">
              {evidenceFile.name} ({(evidenceFile.size / 1024).toFixed(0)} KB)
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleResolve}
            disabled={resolveMutation.isPending || evidenceMutation.isPending}
          >
            {resolveMutation.isPending ? "Resolving..." : "Resolve"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Ingredient Search & Picker (debounced autocomplete) ──

function ExistingIngredientPicker({
  initialQuery,
  selectedIngredient,
  onSelect,
  validationError,
}: {
  initialQuery: string;
  selectedIngredient: IngredientSearchResult | null;
  onSelect: (i: IngredientSearchResult | null) => void;
  validationError: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(
    initialQuery.length >= 2 ? initialQuery : "",
  );
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Debounce: update debouncedQuery 250ms after last keystroke
  useEffect(() => {
    if (searchQuery.length < 2) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchData, isFetching } = useIngredientSearch(debouncedQuery);
  const searchResults = searchData?.results ?? [];

  // Reset highlight when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchResults]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectItem(item: IngredientSearchResult) {
    onSelect(item);
    setSearchQuery(item.inciName);
    setShowDropdown(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown || searchResults.length === 0) {
      if (e.key === "Escape") setShowDropdown(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      selectItem(searchResults[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  const isSearchActive = debouncedQuery.length >= 2;
  const showLoading = isFetching && isSearchActive;
  const showNoResults = !isFetching && isSearchActive && searchResults.length === 0;
  const showResults = searchResults.length > 0;

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-700">
        Search Ingredient Master
      </label>
      <div ref={wrapperRef} className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onSelect(null);
            setShowDropdown(true);
          }}
          onFocus={() => {
            if (searchQuery.length >= 2) setShowDropdown(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type INCI name or CAS number..."
          className={`w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            validationError && !selectedIngredient
              ? "border-red-400"
              : "border-gray-300"
          }`}
        />

        {/* Dropdown */}
        {showDropdown && (showLoading || showNoResults || showResults) && (
          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
            {showLoading && (
              <div className="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                <svg
                  className="animate-spin h-3 w-3 text-gray-400"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Searching...
              </div>
            )}
            {showNoResults && (
              <div className="px-3 py-2 text-xs text-gray-400">
                No results for &quot;{debouncedQuery}&quot;
              </div>
            )}
            {showResults &&
              searchResults.map((r, idx) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => selectItem(r)}
                  className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 last:border-b-0 ${
                    idx === highlightedIndex
                      ? "bg-blue-50"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {r.inciName}
                    </span>
                    {r.casNumber && (
                      <span className="text-xs text-gray-500 font-mono">
                        {r.casNumber}
                      </span>
                    )}
                    <Badge variant="neutral">INCI</Badge>
                  </div>
                  {r.synonyms.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      Synonyms: {r.synonyms.slice(0, 3).join(", ")}
                      {r.synonyms.length > 3 &&
                        ` +${r.synonyms.length - 3} more`}
                    </p>
                  )}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Inline validation error */}
      {validationError && !selectedIngredient && (
        <p className="text-xs text-red-500">{validationError}</p>
      )}

      {/* Selected ingredient confirmation */}
      {selectedIngredient && (
        <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <span className="font-medium text-green-800">
            {selectedIngredient.inciName}
          </span>
          {selectedIngredient.casNumber && (
            <span className="ml-2 text-xs text-green-600 font-mono">
              CAS: {selectedIngredient.casNumber}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
