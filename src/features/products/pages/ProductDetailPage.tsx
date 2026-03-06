import { useState, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { ApiError } from "../../../api/errors";
import { env } from "../../../api/env";
import { isExternalUrl, toInternalPath } from "../../../utils/linkUtils";
import { useProduct, useUpdateProduct, useUploadProductFormulation, useReplaceFormulation, useFormulationHistory } from "../hooks/useProductsApi";
import { useLabels, useSaveLabel, useActivateLabel, useLabelValidation } from "../hooks/useLabelsApi";
import { useProductDocuments, useUploadDocument } from "../hooks/useDocumentsApi";
import {
  useApproveManufacturing,
  useMaxProducible,
  useCreateBatch,
  useBatches,
  useReleaseBatch,
} from "../../manufacturing/hooks/useManufacturingApi";
import type { Batch } from "../../manufacturing/types";
import FinishedGoodsTab from "../../finishedGoods/components/FinishedGoodsTab";
import { useAicisScrutiny, useRunAicisScrutiny, useAicisActive, useBannedRestrictedLatest, useBannedRestrictedImport, useBannedRestrictedIngestOffline, useBannedRestrictedEvaluation } from "../../aicis/hooks/useAicisApi";
import { useRestrictedActiveDataset, useUploadRestrictedPack } from "../../restricted/hooks/useRestrictedApi";
import {
  useComplianceRequestLatest,
  useCreateComplianceRequest,
  useCheckEligibility,
  useApproveComplianceRequest,
} from "../../compliance/hooks/useComplianceApi";
import ResolveIngredientsPanel from "../../compliance/components/ResolveIngredientsPanel";
import type { ComplianceRequest as ComplianceRequestType, GeneratedArtifact, EligibilityStatus, CheckStatus } from "../../compliance/types";
import type { AicisScrutinySnapshot } from "../../aicis/types";
import { api } from "../../../api/client";
import { tokenStore } from "../../../api/tokenStore";
import type {
  ProductStage, RegionCode, SaveLabelPayload, LabelMetadata,
  ProductDocumentType, ProductDocument,
} from "../types";
import { STAGE_LABELS, DOC_TYPE_LABELS, REQUIRED_DOC_TYPES, EXPIRY_REQUIRED_TYPES } from "../types";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import { Card, CardBody } from "../../../components/Card";
import { SkeletonLine } from "../../../components/Skeleton";
import PageError from "../../../components/PageError";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";
import { useAuth } from "../../../context/useAuth";

const STAGE_COLORS: Record<ProductStage, "neutral" | "warning" | "success" | "error"> = {
  PRE_LIFECYCLE: "error",
  IDEA: "neutral",
  R_AND_D: "warning",
  COMPLIANCE_READY: "success",
  PACKAGING_READY: "success",
  MANUFACTURING_APPROVED: "success",
  BATCH_CREATED: "success",
  BATCH_RELEASED: "success",
  READY_FOR_SALE: "success",
  LIVE: "success",
  DISCONTINUED: "error",
};

const TABS = ["R&D", "Labels", "Documents", "Manufacturing", "Finished Goods", "Compliance", "Approvals", "Packaging", "Batches", "Inventory", "Sales"] as const;

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useProduct(id!);
  const uploadFormulationMutation = useUploadProductFormulation(id!);
  const replaceFormulationMutation = useReplaceFormulation(id!);

  const [activeTab, setActiveTab] = useState<string>("R&D");
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);

  const product = data?.product;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <SkeletonLine className="h-8 w-64" />
          <SkeletonLine className="h-4 w-48" />
        </div>
        <Card><CardBody className="space-y-3">
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-3/4" />
        </CardBody></Card>
      </div>
    );
  }

  if (error || !product) {
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <PageError
        title={is404 ? "Product not found" : "Failed to load product"}
        message={is404 ? "This product does not exist or has been removed." : error instanceof Error ? error.message : "Product not found"}
        onRetry={is404 ? undefined : () => refetch()}
      />
    );
  }

  function handleUploadFormulation(file: File) {
    uploadFormulationMutation.mutate(file, {
      onSuccess: (res) => {
        toast("success", `Formulation uploaded — ${res.extractedRowCount} ingredients extracted.`);
        setShowUploadModal(false);
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Upload failed"),
    });
  }

  function handleReplaceFormulation(file: File) {
    replaceFormulationMutation.mutate(file, {
      onSuccess: (res) => {
        toast(
          "success",
          `Formulation replaced (v${res.previousVersion} → v${res.newVersion}). ${res.extractedRowCount} ingredients extracted. Compliance re-running...`,
        );
        setShowReplaceModal(false);
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Replace failed"),
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`${product.skuCode}${product.productLine ? ` — ${product.productLine}` : ""}`}
        action={
          <Link to="/products">
            <Button variant="secondary" size="sm">Back</Button>
          </Link>
        }
      />

      {/* Stage + Regions */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Stage:</span>
          <Badge variant={STAGE_COLORS[product.stage]}>
            {STAGE_LABELS[product.stage]}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Regions:</span>
          <div className="flex gap-1">
            {product.targetRegions.map((reg) => (
              <Badge key={reg} variant="neutral">{reg}</Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Lifecycle Gate */}
      {product.stage === "PRE_LIFECYCLE" && (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Lifecycle Gate</h3>
            <p className="text-sm text-gray-600">
              This product is in <strong>Pre-Lifecycle</strong>. Upload a formulation/datasheet
              to begin the product lifecycle.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <span className={product.hasDatasheetUpload ? "text-green-600" : "text-red-500"}>
                {product.hasDatasheetUpload ? "\u2705" : "\u274C"}
              </span>
              <span className="text-gray-700">Formulation Upload</span>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Formulation Upload */}
      <FormulationUploadCard
        product={product}
        productId={id!}
        uploading={uploadFormulationMutation.isPending}
        replacing={replaceFormulationMutation.isPending}
        onUploadClick={() => setShowUploadModal(true)}
        onReplaceClick={() => setShowReplaceModal(true)}
      />

      {/* Upload Modal (first upload only) */}
      {showUploadModal && (
        <FormulationUploadModal
          uploading={uploadFormulationMutation.isPending}
          onUpload={handleUploadFormulation}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Replace Formulation Modal */}
      {showReplaceModal && (
        <ReplaceFormulationModal
          replacing={replaceFormulationMutation.isPending}
          currentVersion={product.latestUpload?.version ?? 1}
          currentFileName={product.latestUpload?.fileName ?? "current"}
          onReplace={handleReplaceFormulation}
          onClose={() => setShowReplaceModal(false)}
        />
      )}

      {/* Brand / Range */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BrandRangeCard
          productId={product.id}
          brand={product.brand}
          rangeName={product.range?.name ?? "—"}
        />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "R&D" && (
        <Card>
          <CardBody>
            {product.latestUpload ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Latest Upload</h3>
                  <Badge variant="success">Linked</Badge>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Latest upload:</span>{" "}
                  <span className="text-gray-900">
                    {product.latestUpload.fileName}
                  </span>
                  <span className="ml-2 text-gray-400">
                    ({new Date(product.latestUpload.createdAt).toLocaleDateString()})
                  </span>
                  {product.latestUpload.rows && (
                    <span className="ml-2 text-gray-500">
                      — {product.latestUpload.rows.length} ingredients
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Upload a formulation to begin R&D work.</p>
            )}
          </CardBody>
        </Card>
      )}

      {activeTab === "Labels" && (
        <LabelsTab productId={product.id} />
      )}

      {activeTab === "Documents" && (
        <DocumentsTab productId={product.id} />
      )}

      {activeTab === "Manufacturing" && (
        <ManufacturingTab productId={product.id} stage={product.stage} />
      )}

      {activeTab === "Finished Goods" && (
        <FinishedGoodsTab
          productId={product.id}
          packNetContentMl={product.packNetContentMl}
          fillDensityGPerMl={product.fillDensityGPerMl}
        />
      )}

      {activeTab === "Compliance" && (
        <ComplianceTab
          uploadId={product.latestUpload?.id}
          hasFormulation={!!product.latestUploadId}
          productId={product.id}
        />
      )}

      {activeTab === "Approvals" && (
        <ApprovalsTab productId={product.id} />
      )}

      {activeTab !== "R&D" && activeTab !== "Labels" && activeTab !== "Documents" && activeTab !== "Manufacturing" && activeTab !== "Finished Goods" && activeTab !== "Compliance" && activeTab !== "Approvals" && (
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">
              {activeTab} — coming soon.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Stage History */}
      {product.stageEvents && product.stageEvents.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Stage History</h3>
            <div className="space-y-2">
              {product.stageEvents.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 text-sm">
                  <Badge variant="neutral">{STAGE_LABELS[ev.fromStage]}</Badge>
                  <span className="text-gray-400">&rarr;</span>
                  <Badge variant={STAGE_COLORS[ev.toStage]}>{STAGE_LABELS[ev.toStage]}</Badge>
                  <span className="text-gray-500">
                    {new Date(ev.createdAt).toLocaleString()}
                    {ev.createdBy && ` — ${ev.createdBy.fullName}`}
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Labels Tab ──

const REGIONS: RegionCode[] = ["IN", "AU"];

function LabelsTab({ productId }: { productId: string }) {
  const [region, setRegion] = useState<RegionCode>("IN");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useLabels(productId, region);
  const { data: validation, isLoading: validating } = useLabelValidation(productId, region);
  const saveMutation = useSaveLabel(productId);
  const activateMutation = useActivateLabel(productId);
  const { toast } = useToast();

  const labels = data?.labels ?? [];
  const activeLabel = labels.find((l) => l.isActive) ?? null;

  function handleSave(payload: SaveLabelPayload) {
    saveMutation.mutate(payload, {
      onSuccess: () => {
        toast("success", `Label v${(labels[0]?.versionNumber ?? 0) + 1} saved & activated.`);
        setShowForm(false);
      },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Failed to save label"),
    });
  }

  function handleActivate(labelId: string) {
    activateMutation.mutate(labelId, {
      onSuccess: () => toast("success", "Label activated."),
      onError: (err) => toast("error", err instanceof Error ? err.message : "Activation failed"),
    });
  }

  return (
    <div className="space-y-4">
      {/* Region switcher */}
      <div className="flex items-center gap-2">
        {REGIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => { setRegion(r); setShowForm(false); }}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              region === r
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {r === "IN" ? "India (IN)" : "Australia (AU)"}
          </button>
        ))}
      </div>

      {/* Validation panel */}
      {validation && (
        <Card>
          <CardBody>
            <div className="flex items-center gap-2">
              <Badge variant={validation.isValid ? "success" : "error"}>
                {validation.isValid ? "Valid" : "Invalid"}
              </Badge>
              <span className="text-sm font-medium text-gray-700">
                Label Validation ({region})
              </span>
              {validating && <span className="text-xs text-gray-400">checking...</span>}
            </div>
            {validation.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {validation.errors.map((err, i) => (
                  <li key={i} className="text-sm text-red-600">• {err}</li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      {/* Active label summary */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Active Label — {region}
            </h3>
            <Can permission="products:write">
              <Button size="sm" onClick={() => setShowForm(!showForm)}>
                {showForm ? "Cancel" : activeLabel ? "New Version" : "Create Label"}
              </Button>
            </Can>
          </div>
          {activeLabel ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <LabelField label="Version" value={`v${activeLabel.versionNumber}`} />
              <LabelField label="Product Name" value={activeLabel.productName} />
              <LabelField label="Net Quantity" value={activeLabel.netQuantity} />
              <LabelField label="INCI Declaration" value={activeLabel.inciDeclaration} />
              <LabelField label="Warnings" value={activeLabel.warnings ?? "—"} />
              <LabelField label="Manufacturer" value={activeLabel.manufacturerName ?? "—"} />
              <LabelField label="Manufacturer Address" value={activeLabel.manufacturerAddress ?? "—"} />
              <LabelField label="Batch Format" value={activeLabel.batchFormat ?? "—"} />
              <LabelField label="Mfg Date" value={activeLabel.mfgDate ? new Date(activeLabel.mfgDate).toLocaleDateString() : "—"} />
              <LabelField label="Exp Date" value={activeLabel.expDate ? new Date(activeLabel.expDate).toLocaleDateString() : "—"} />
              <LabelField label="Created" value={`${new Date(activeLabel.createdAt).toLocaleString()} by ${activeLabel.createdBy.fullName}`} />
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              {isLoading ? "Loading..." : "No active label for this region."}
            </p>
          )}
        </CardBody>
      </Card>

      {/* Label form */}
      {showForm && (
        <Card>
          <CardBody>
            <LabelForm
              region={region}
              defaults={activeLabel}
              saving={saveMutation.isPending}
              onSave={handleSave}
              onCancel={() => setShowForm(false)}
            />
          </CardBody>
        </Card>
      )}

      {/* Version history */}
      {labels.length > 1 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
            <div className="divide-y divide-gray-100">
              {labels.map((label) => (
                <div key={label.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">v{label.versionNumber}</span>
                    {label.isActive && <Badge variant="success">Active</Badge>}
                    <span className="text-xs text-gray-500">
                      {new Date(label.createdAt).toLocaleString()} — {label.createdBy.fullName}
                    </span>
                  </div>
                  {!label.isActive && (
                    <Can permission="products:write">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={activateMutation.isPending}
                        onClick={() => handleActivate(label.id)}
                      >
                        Activate
                      </Button>
                    </Can>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function LabelField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}:</span>{" "}
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

// ── Label Form ──

function LabelForm({
  region,
  defaults,
  saving,
  onSave,
  onCancel,
}: {
  region: RegionCode;
  defaults: LabelMetadata | null;
  saving: boolean;
  onSave: (payload: SaveLabelPayload) => void;
  onCancel: () => void;
}) {
  const [productName, setProductName] = useState(defaults?.productName ?? "");
  const [netQuantity, setNetQuantity] = useState(defaults?.netQuantity ?? "");
  const [inciDeclaration, setInciDeclaration] = useState(defaults?.inciDeclaration ?? "");
  const [warnings, setWarnings] = useState(defaults?.warnings ?? "");
  const [manufacturerName, setManufacturerName] = useState(defaults?.manufacturerName ?? "");
  const [manufacturerAddress, setManufacturerAddress] = useState(defaults?.manufacturerAddress ?? "");
  const [batchFormat, setBatchFormat] = useState(defaults?.batchFormat ?? "");
  const [mfgDate, setMfgDate] = useState(defaults?.mfgDate?.slice(0, 10) ?? "");
  const [expDate, setExpDate] = useState(defaults?.expDate?.slice(0, 10) ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      region,
      productName: productName.trim(),
      netQuantity: netQuantity.trim(),
      inciDeclaration: inciDeclaration.trim(),
      ...(warnings.trim() && { warnings: warnings.trim() }),
      ...(manufacturerName.trim() && { manufacturerName: manufacturerName.trim() }),
      ...(manufacturerAddress.trim() && { manufacturerAddress: manufacturerAddress.trim() }),
      ...(batchFormat.trim() && { batchFormat: batchFormat.trim() }),
      ...(mfgDate && { mfgDate }),
      ...(expDate && { expDate }),
    });
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {defaults ? `New Version (based on v${defaults.versionNumber})` : "Create Label"} — {region}
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Product Name *</label>
          <input className={inputCls} value={productName} onChange={(e) => setProductName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Net Quantity *</label>
          <input className={inputCls} value={netQuantity} onChange={(e) => setNetQuantity(e.target.value)} placeholder="Net 50 ml" required />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">INCI Declaration *</label>
          <textarea className={inputCls} rows={3} value={inciDeclaration} onChange={(e) => setInciDeclaration(e.target.value)} required />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Warnings</label>
          <textarea className={inputCls} rows={2} value={warnings} onChange={(e) => setWarnings(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Manufacturer Name</label>
          <input className={inputCls} value={manufacturerName} onChange={(e) => setManufacturerName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Manufacturer Address</label>
          <input className={inputCls} value={manufacturerAddress} onChange={(e) => setManufacturerAddress(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Batch Format</label>
          <input className={inputCls} value={batchFormat} onChange={(e) => setBatchFormat(e.target.value)} />
        </div>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Mfg Date</label>
            <input type="date" className={inputCls} value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-700 mb-1">Exp Date</label>
            <input type="date" className={inputCls} value={expDate} onChange={(e) => setExpDate(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !productName.trim() || !netQuantity.trim() || !inciDeclaration.trim()}>
          {saving ? "Saving..." : "Save & Activate"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Documents Tab ──

const ALL_DOC_TYPES: ProductDocumentType[] = [
  "COA", "SDS", "STABILITY_REPORT", "MICROBIAL_REPORT",
  "LAB_REPORT", "PACKAGING_ARTWORK", "OTHER",
];

function DocumentsTab({ productId }: { productId: string }) {
  const { data, isLoading } = useProductDocuments(productId);
  const uploadMutation = useUploadDocument(productId);
  const { toast } = useToast();
  const [showUpload, setShowUpload] = useState(false);

  const documents = data?.documents ?? [];

  // Group by type to find latest per type
  const latestByType = new Map<string, ProductDocument>();
  for (const doc of documents) {
    if (!latestByType.has(doc.type)) {
      latestByType.set(doc.type, doc);
    }
  }

  function handleUpload(formData: FormData) {
    uploadMutation.mutate(formData, {
      onSuccess: (res) => {
        toast("success", `${DOC_TYPE_LABELS[res.document.type]} v${res.document.versionNumber} uploaded.`);
        setShowUpload(false);
      },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Upload failed"),
    });
  }

  function handleDownload(doc: ProductDocument) {
    const url = api.documents.downloadUrl(productId, doc.id);
    const token = tokenStore.getAccessToken();
    // Fetch with auth header and trigger browser download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = doc.originalFilename;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => toast("error", "Download failed"));
  }

  return (
    <div className="space-y-4">
      {/* Required Docs Status */}
      <RequiredDocsStatus latestByType={latestByType} />

      {/* Upload button */}
      <div className="flex justify-end">
        <Can permission="products:write">
          <Button size="sm" onClick={() => setShowUpload(!showUpload)}>
            {showUpload ? "Cancel" : "Upload Document"}
          </Button>
        </Can>
      </div>

      {/* Upload modal/form */}
      {showUpload && (
        <Card>
          <CardBody>
            <UploadDocumentForm
              saving={uploadMutation.isPending}
              onUpload={handleUpload}
              onCancel={() => setShowUpload(false)}
            />
          </CardBody>
        </Card>
      )}

      {/* Documents table */}
      <Card>
        <CardBody>
          {isLoading ? (
            <div className="space-y-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Ver</th>
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Issue</th>
                    <th className="py-2 pr-4">Expiry</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Uploaded By</th>
                    <th className="py-2 pr-4">Uploaded At</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {documents.map((doc) => {
                    const isLatest = latestByType.get(doc.type)?.id === doc.id;
                    const expiryStatus = getExpiryStatus(doc);
                    return (
                      <tr key={doc.id} className={isLatest ? "bg-blue-50/30" : ""}>
                        <td className="py-2 pr-4 font-medium text-gray-900">
                          {DOC_TYPE_LABELS[doc.type]}
                        </td>
                        <td className="py-2 pr-4">
                          v{doc.versionNumber}
                          {isLatest && (
                            <Badge variant="success" className="ml-1">Latest</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-gray-700 max-w-[200px] truncate">
                          {doc.originalFilename}
                        </td>
                        <td className="py-2 pr-4 text-gray-600">
                          {doc.issueDate ? new Date(doc.issueDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 pr-4 text-gray-600">
                          {doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={expiryStatus.variant}>{expiryStatus.label}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-gray-600">{doc.createdBy.fullName}</td>
                        <td className="py-2 pr-4 text-gray-600">
                          {new Date(doc.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2">
                          <Button size="sm" variant="secondary" onClick={() => handleDownload(doc)}>
                            Download
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function getExpiryStatus(doc: ProductDocument): { label: string; variant: "success" | "warning" | "error" | "neutral" } {
  if (!doc.expiryDate) return { label: "No Expiry", variant: "neutral" };
  const now = new Date();
  const expiry = new Date(doc.expiryDate);
  if (expiry < now) return { label: "Expired", variant: "error" };
  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysUntil <= 30) return { label: `${daysUntil}d left`, variant: "warning" };
  return { label: "Valid", variant: "success" };
}

// ── Required Docs Status ──

function RequiredDocsStatus({ latestByType }: { latestByType: Map<string, ProductDocument> }) {
  const now = new Date();

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Required Documents Status</h3>
        <div className="grid grid-cols-2 gap-3">
          {REQUIRED_DOC_TYPES.map((type) => {
            const doc = latestByType.get(type);
            let status: string;
            let variant: "success" | "error" | "warning" | "neutral";
            let detail = "";

            if (!doc) {
              status = "Missing";
              variant = "error";
            } else if (EXPIRY_REQUIRED_TYPES.includes(type)) {
              if (!doc.expiryDate) {
                status = "No Expiry";
                variant = "error";
              } else {
                const expiry = new Date(doc.expiryDate);
                if (expiry < now) {
                  status = "Expired";
                  variant = "error";
                } else {
                  const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  status = "Valid";
                  variant = days <= 30 ? "warning" : "success";
                  detail = `${days} days remaining`;
                }
              }
            } else {
              // Reports: expiry optional
              if (doc.expiryDate && new Date(doc.expiryDate) < now) {
                status = "Expired";
                variant = "error";
              } else {
                status = "Present";
                variant = "success";
                if (doc.expiryDate) {
                  const days = Math.ceil((new Date(doc.expiryDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  detail = `${days} days remaining`;
                }
              }
            }

            return (
              <div key={type} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-900">{DOC_TYPE_LABELS[type as ProductDocumentType]}</span>
                  {doc && <span className="ml-2 text-xs text-gray-500">v{doc.versionNumber}</span>}
                  {detail && <span className="ml-2 text-xs text-gray-500">({detail})</span>}
                </div>
                <Badge variant={variant}>{status}</Badge>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Upload Document Form ──

function UploadDocumentForm({
  saving,
  onUpload,
  onCancel,
}: {
  saving: boolean;
  onUpload: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<string>("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const expiryRequired = EXPIRY_REQUIRED_TYPES.includes(type as ProductDocumentType);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile || !type) return;

    const fd = new FormData();
    fd.append("file", selectedFile);
    fd.append("type", type);
    if (issueDate) fd.append("issueDate", issueDate);
    if (expiryDate) fd.append("expiryDate", expiryDate);
    if (notes.trim()) fd.append("notes", notes.trim());
    onUpload(fd);
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Upload Document</h3>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Document Type *</label>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)} required>
            <option value="">Select type...</option>
            {ALL_DOC_TYPES.map((t) => (
              <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">File *</label>
          <input
            type="file"
            ref={fileRef}
            accept=".pdf,.xlsx,.docx,.png,.jpg,.jpeg"
            className={inputCls}
            required
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Issue Date</label>
          <input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Expiry Date {expiryRequired && "*"}
          </label>
          <input
            type="date"
            className={inputCls}
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            required={expiryRequired}
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving || !type || !selectedFile}>
          {saving ? "Uploading..." : "Upload"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

// ── Compliance Tab (AICIS CAS-Only Scrutiny) ──

const SCRUTINY_STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  PASS: "success",
  FAIL: "error",
  NEEDS_REVIEW: "warning",
};

const CAS_RESULT_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  FOUND: "success",
  NOT_FOUND: "error",
  NOT_LISTED: "warning",
  NEEDS_REVIEW: "warning",
  MISSING_CAS: "warning",
  AMBIGUOUS: "warning",
};

const MATCH_METHOD_LABEL: Record<string, string> = {
  CAS: "CAS",
  NAME: "Name",
  SYNONYM: "Synonym",
  NONE: "—",
};

function ComplianceTab({
  uploadId,
  hasFormulation,
  productId,
}: {
  uploadId: string | undefined;
  hasFormulation: boolean;
  productId: string;
}) {
  const { toast } = useToast();
  const { data: activeData, isLoading: activeLoading } = useAicisActive("AU");
  const { data, isLoading, error } = useAicisScrutiny(uploadId);
  const runMutation = useRunAicisScrutiny(uploadId);

  const hasActiveSnapshot = activeData?.active ?? false;

  if (!hasFormulation) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-500">
            Upload a formulation first to run compliance checks.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (!uploadId) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-gray-500">
            No upload found for the active formulation.
          </p>
        </CardBody>
      </Card>
    );
  }

  const scrutiny: AicisScrutinySnapshot | null = data?.scrutiny ?? null;
  const is404 = error && typeof error === "object" && "status" in error && (error as { status?: number }).status === 404;

  function handleRerun() {
    if (!hasActiveSnapshot) {
      toast("error", "No AICIS inventory snapshot has been imported yet. Go to AICIS Inventory to upload one.");
      return;
    }
    runMutation.mutate(undefined, {
      onSuccess: () => toast("success", "AICIS scrutiny completed."),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Scrutiny failed"),
    });
  }

  return (
    <div className="space-y-4">
      {/* Active snapshot warning */}
      {!activeLoading && !hasActiveSnapshot && (
        <Card>
          <CardBody className="flex items-center gap-3">
            <Badge variant="error">No Snapshot</Badge>
            <p className="text-sm text-gray-600">
              No AICIS inventory snapshot has been imported yet. Import one from the{" "}
              <a href="/regulatory/aicis" className="text-blue-600 underline">AICIS Inventory</a>{" "}
              page to enable compliance checking.
            </p>
          </CardBody>
        </Card>
      )}

      {/* Summary card */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              AICIS Inventory Scrutiny (Australia)
            </h3>
            <Can permission="products:write">
              <Button
                size="sm"
                onClick={handleRerun}
                disabled={runMutation.isPending || !hasActiveSnapshot}
              >
                {runMutation.isPending ? "Running..." : scrutiny ? "Re-run Scrutiny" : "Run Scrutiny"}
              </Button>
            </Can>
          </div>

          {isLoading || activeLoading ? (
            <div className="space-y-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          ) : !scrutiny && is404 ? (
            <p className="text-sm text-gray-500">
              {hasActiveSnapshot
                ? "No AICIS scrutiny has been run yet for this upload. Click \"Run Scrutiny\" to check ingredients against the AICIS Inventory."
                : "Import an AICIS inventory snapshot first, then run scrutiny."}
            </p>
          ) : error && !is404 ? (
            <p className="text-sm text-red-600">
              Failed to load scrutiny data.
            </p>
          ) : scrutiny ? (
            <>
              {/* Status + Counts */}
              <div className="flex items-center gap-4">
                <Badge variant={SCRUTINY_STATUS_VARIANT[scrutiny.status] ?? "neutral"}>
                  {scrutiny.status}
                </Badge>
                <span className="text-xs text-gray-500">
                  {scrutiny.totalRows} ingredients checked
                </span>
                <span className="text-xs text-gray-500">
                  AICIS version: {scrutiny.snapshot.versionName}
                </span>
              </div>

              {/* Count chips */}
              <div className="flex flex-wrap gap-3 text-sm">
                <CountChip label="Found" count={scrutiny.foundCount} variant="success" />
                <CountChip label="Not Found" count={scrutiny.notFoundCount} variant="error" />
                {(scrutiny.notListedCount ?? 0) > 0 && (
                  <CountChip label="Not Listed" count={scrutiny.notListedCount ?? 0} variant="warning" />
                )}
                {(scrutiny.needsReviewCount ?? 0) > 0 && (
                  <CountChip label="Needs Review" count={scrutiny.needsReviewCount ?? 0} variant="warning" />
                )}
                <CountChip label="Missing CAS" count={scrutiny.missingCasCount} variant="warning" />
                {(scrutiny.ambiguousCount ?? 0) > 0 && (
                  <CountChip label="Ambiguous" count={scrutiny.ambiguousCount ?? 0} variant="warning" />
                )}
              </div>

              <p className="text-xs text-gray-400">
                Run at {new Date(scrutiny.createdAt).toLocaleString()}
              </p>
            </>
          ) : null}
        </CardBody>
      </Card>

      {/* Findings table */}
      {scrutiny && scrutiny.findings.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Row-Level Findings</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-4">Ingredient</th>
                    <th className="py-2 pr-4">CAS</th>
                    <th className="py-2 pr-4">AICIS Result</th>
                    <th className="py-2 pr-4">Match By</th>
                    <th className="py-2 pr-4">CR No.</th>
                    <th className="py-2 pr-4">AICIS Name</th>
                    <th className="py-2">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scrutiny.findings.map((f) => (
                    <tr key={f.id}>
                      <td className="py-2 pr-4 font-medium text-gray-900 max-w-[200px] truncate">
                        {f.uploadRow.inciSuggestion ?? f.uploadRow.rawName}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 font-mono text-xs">
                        {f.uploadRow.casNumber ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={CAS_RESULT_VARIANT[f.result] ?? "neutral"}>
                          {f.evidenceJson.casValidity === "INVALID"
                            ? "Invalid CAS"
                            : f.result === "FOUND" && f.evidenceJson.evidenceType === "EXTERNAL_VALIDATION"
                              ? "FOUND (CAS)"
                              : f.result === "NOT_LISTED"
                                ? "CAS valid, not in AICIS"
                                : f.result === "NEEDS_REVIEW"
                                  ? "Verification required"
                                  : f.result === "MISSING_CAS"
                                    ? "MISSING CAS"
                                    : f.result === "NOT_FOUND"
                                      ? "NOT FOUND"
                                      : f.result.replace("_", " ")}
                        </Badge>
                        {f.evidenceJson.canonicalName && (
                          <span className="block text-[11px] text-blue-600 mt-0.5">
                            {f.evidenceJson.canonicalName}
                          </span>
                        )}
                        {f.evidenceJson.canonicalSource && (
                          <span className="block text-[10px] text-gray-500 mt-0.5">
                            Source: {f.evidenceJson.canonicalSource === "commonchemistry.cas.org"
                              ? "CAS Common Chemistry"
                              : "Internal AICIS DB"}
                          </span>
                        )}
                        {f.result === "NEEDS_REVIEW" && f.evidenceJson.casValidity === "VALID" && !f.evidenceJson.canonicalName && (
                          <span className="block text-[10px] text-amber-500 mt-0.5">
                            CAS valid (name not resolved)
                          </span>
                        )}
                        {f.evidenceJson.reason && (
                          <span className="block text-[10px] text-gray-400 mt-0.5" title={f.evidenceJson.reason}>
                            {f.evidenceJson.reason.length > 60 ? f.evidenceJson.reason.slice(0, 60) + "…" : f.evidenceJson.reason}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-xs text-gray-600">
                        {MATCH_METHOD_LABEL[f.matchMethod] ?? f.matchMethod}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 font-mono text-xs">
                        {f.matchedCrNo ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-gray-600 max-w-[200px] truncate">
                        {f.matchedApprovedName ?? f.evidenceJson.canonicalName ?? "—"}
                      </td>
                      <td className="py-2 text-xs">
                        {f.evidenceJson.evidenceUrl ? (
                          isExternalUrl(toInternalPath(f.evidenceJson.evidenceUrl)) ? (
                            <a
                              href={f.evidenceJson.evidenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View record
                            </a>
                          ) : (
                            <Link
                              to={toInternalPath(f.evidenceJson.evidenceUrl)}
                              className="text-blue-600 hover:underline"
                            >
                              View record
                            </Link>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Source of Truth audit line */}
            <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <span className="font-medium text-gray-700">Source of Truth:</span>{" "}
              AICIS Inventory Snapshot (internal) &mdash;{" "}
              {scrutiny.snapshot.sourceFileName}{" "}
              &mdash; effective {new Date(scrutiny.snapshot.asOfDate).toLocaleDateString()}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Banned / Restricted Scrutiny ── */}
      <BannedRestrictedSection uploadId={uploadId} productId={productId} />
    </div>
  );
}

const BR_STATUS_VARIANT: Record<string, "success" | "error" | "warning" | "neutral"> = {
  FOUND: "error",
  FOUND_BY_NAME: "warning",
  NOT_LISTED: "success",
  CANNOT_CHECK: "neutral",
  NEEDS_REVIEW: "warning",
};

const BR_STATUS_LABEL: Record<string, string> = {
  FOUND: "FOUND",
  FOUND_BY_NAME: "FOUND (NAME)",
  NOT_LISTED: "NOT LISTED",
  CANNOT_CHECK: "CANNOT CHECK",
  NEEDS_REVIEW: "NEEDS REVIEW",
};

/** Evidence artifact definitions for the upload modal */
const EVIDENCE_ARTIFACTS = [
  {
    linkType: "HUB",
    label: "AICIS Hub Page (banned or restricted chemicals)",
    sourceUrl: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals",
  },
  {
    linkType: "ROTTERDAM_IMPORT",
    label: "Rotterdam Convention – Import Authorisation",
    sourceUrl: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-import-authorisation-rotterdam-convention",
  },
  {
    linkType: "ROTTERDAM_EXPORT",
    label: "Rotterdam Convention – Export Authorisation",
    sourceUrl: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/chemicals-listed-rotterdam-and-stockholm-conventions/apply-annual-export-authorisation-rotterdam-convention",
  },
  {
    linkType: "MINAMATA",
    label: "Minamata Convention – Mercury Import/Export",
    sourceUrl: "https://www.industrialchemicals.gov.au/chemical-information/banned-or-restricted-chemicals/importing-or-exporting-mercury",
  },
  {
    linkType: "POISONS_STANDARD",
    label: "Poisons Standard (February 2026)",
    sourceUrl: "https://www.legislation.gov.au/F2021L00650/latest/text",
  },
];

function BannedRestrictedSection({ uploadId, productId }: { uploadId: string | undefined; productId: string }) {
  const { toast } = useToast();
  const { data: brSnapshot, isLoading: brSnapshotLoading } = useBannedRestrictedLatest();
  const { data: brEval, isLoading: brEvalLoading } = useBannedRestrictedEvaluation(uploadId);
  const { data: restrictedDataset, isLoading: restrictedDatasetLoading } = useRestrictedActiveDataset();
  const uploadRestrictedMutation = useUploadRestrictedPack();
  const importMutation = useBannedRestrictedImport();
  const ingestOfflineMutation = useBannedRestrictedIngestOffline();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showOfflineModal, setShowOfflineModal] = useState(false);
  const [showCsvUploadModal, setShowCsvUploadModal] = useState(false);
  const [downloadingRestrictedReport, setDownloadingRestrictedReport] = useState<"xlsx" | "pdf" | null>(null);

  const snapshot = brSnapshot?.snapshot ?? null;
  const isOfflineSnapshot = snapshot?.sourceUrl === "OFFLINE_EVIDENCE_PACK";
  const activeDataset = restrictedDataset?.dataset ?? null;

  function handleImport(formData: FormData) {
    importMutation.mutate(formData, {
      onSuccess: (data) => {
        const r = data?.result;
        setShowUploadModal(false);
        if (r && r.isComplete) {
          toast("success", `Imported: ${r.chemicalsCount} chemicals from ${r.sourcesSuccess} source(s).`);
        } else if (r) {
          toast("error", `Import completed but no chemicals extracted (${r.sourcesFailed} source(s) failed to parse).`);
        }
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Import failed"),
    });
  }

  function handleOfflineIngest(formData: FormData) {
    ingestOfflineMutation.mutate(formData, {
      onSuccess: (data) => {
        const r = data?.result;
        setShowOfflineModal(false);
        if (r && r.isComplete) {
          toast("success", `Offline pack ingested: ${r.chemicalsCount} chemicals from ${r.sourcesSuccess} file(s).`);
        } else if (r) {
          toast("error", `Ingestion completed but no chemicals extracted. ${r.sourcesFailed} file(s) failed.`);
        }
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Offline ingestion failed"),
    });
  }

  function handleCsvUpload(formData: FormData) {
    uploadRestrictedMutation.mutate(formData, {
      onSuccess: (data) => {
        const ds = data?.dataset;
        setShowCsvUploadModal(false);
        if (ds) {
          toast("success", `Dataset uploaded: ${ds.name} v${ds.versionLabel} (${ds.chemicalsCount} chemicals).`);
        }
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "CSV upload failed"),
    });
  }

  async function handleDownloadRestrictedReport(format: "xlsx" | "pdf") {
    setDownloadingRestrictedReport(format);
    try {
      const token = tokenStore.getAccessToken();
      const url = `${env.API_BASE}/restricted/report.${format}?productId=${encodeURIComponent(productId)}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message || `Download failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const disposition = resp.headers.get("Content-Disposition");
      a.download = disposition?.match(/filename="?([^"]+)"?/)?.[1] ?? `restricted-report.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingRestrictedReport(null);
    }
  }

  return (
    <>
      {/* ── Active Dataset Banner ── */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Banned / Restricted Scrutiny (Australia)
            </h3>
            <div className="flex gap-2">
              <Can permission="products:write">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowCsvUploadModal(true)}
                  disabled={uploadRestrictedMutation.isPending}
                >
                  {uploadRestrictedMutation.isPending ? "Uploading..." : "Upload Restricted CSV"}
                </Button>
              </Can>
              <Can permission="products:write">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setShowOfflineModal(true)}
                  disabled={ingestOfflineMutation.isPending}
                >
                  {ingestOfflineMutation.isPending ? "Ingesting..." : "Upload Evidence PDFs"}
                </Button>
              </Can>
            </div>
          </div>

          {/* Active Offline Dataset Banner */}
          {restrictedDatasetLoading ? (
            <SkeletonLine className="h-4 w-full" />
          ) : activeDataset ? (
            <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
              <span className="font-semibold">Active Dataset:</span>{" "}
              {activeDataset.name} v{activeDataset.versionLabel}{" "}
              ({activeDataset.chemicalsCount} chemicals)
              {activeDataset.effectiveDate && (
                <> — Effective: {new Date(activeDataset.effectiveDate).toLocaleDateString()}</>
              )}
              <span className="ml-2 text-green-600">
                Uploaded: {new Date(activeDataset.createdAt).toLocaleDateString()}
              </span>
              {/* Restricted Report Download Buttons */}
              <span className="ml-3">
                <button
                  className="text-green-700 underline hover:text-green-900 mr-2"
                  onClick={() => handleDownloadRestrictedReport("xlsx")}
                  disabled={downloadingRestrictedReport !== null}
                >
                  {downloadingRestrictedReport === "xlsx" ? "..." : "Excel Report"}
                </button>
                <button
                  className="text-green-700 underline hover:text-green-900"
                  onClick={() => handleDownloadRestrictedReport("pdf")}
                  disabled={downloadingRestrictedReport !== null}
                >
                  {downloadingRestrictedReport === "pdf" ? "..." : "PDF Report"}
                </button>
              </span>
            </div>
          ) : (
            <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">No active restricted chemical dataset.</span>{" "}
              Upload a CSV with banned/restricted chemicals to enable offline compliance checks.
            </div>
          )}

          {/* Legacy Snapshot Info */}
          {brSnapshotLoading ? (
            <div className="space-y-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          ) : snapshot && !activeDataset ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                <Badge variant={isOfflineSnapshot ? "warning" : "neutral"}>
                  {isOfflineSnapshot ? "Offline Pack" : "Legacy Snapshot"}
                </Badge>
                <span>
                  Fetched: {new Date(snapshot.fetchedAt).toLocaleString()}
                </span>
                <span>{snapshot.sourcesSuccess}/{snapshot.sourcesTotal} sources</span>
                <span>{snapshot.chemicalsCount} chemicals indexed</span>
                {snapshot.isComplete ? (
                  <Badge variant="success">Complete</Badge>
                ) : (
                  <Badge variant="error">Incomplete</Badge>
                )}
              </div>

              {!snapshot.isComplete && (
                <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-semibold">Legacy snapshot incomplete.</span>{" "}
                  Upload a restricted chemicals CSV for reliable offline compliance checks.
                </div>
              )}
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Upload Evidence Modal (structured per-source) */}
      {showUploadModal && (
        <UploadEvidenceModal
          saving={importMutation.isPending}
          onImport={handleImport}
          onClose={() => setShowUploadModal(false)}
        />
      )}

      {/* Offline Evidence Pack Modal (simple multi-file) */}
      {showOfflineModal && (
        <OfflineEvidencePackModal
          saving={ingestOfflineMutation.isPending}
          onIngest={handleOfflineIngest}
          onClose={() => setShowOfflineModal(false)}
        />
      )}

      {/* Restricted CSV Upload Modal */}
      {showCsvUploadModal && (
        <RestrictedCsvUploadModal
          saving={uploadRestrictedMutation.isPending}
          onUpload={handleCsvUpload}
          onClose={() => setShowCsvUploadModal(false)}
        />
      )}

      {/* Per-ingredient evaluation table */}
      {brEval && brEval.rows.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Banned/Restricted — Per-Ingredient Results
            </h3>
            {brEvalLoading ? (
              <SkeletonLine className="h-4 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="py-2 pr-4">Ingredient</th>
                      <th className="py-2 pr-4">CAS</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2 pr-4">Reason</th>
                      <th className="py-2">Evidence</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {brEval.rows.map((row) => (
                      <tr key={row.uploadRowId}>
                        <td className="py-2 pr-4 font-medium text-gray-900 max-w-[200px] truncate">
                          {row.rawName}
                        </td>
                        <td className="py-2 pr-4 text-gray-600 font-mono text-xs">
                          {row.casNumber ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Badge variant={BR_STATUS_VARIANT[row.outcome.status] ?? "neutral"}>
                            {BR_STATUS_LABEL[row.outcome.status] ?? row.outcome.status}
                          </Badge>
                        </td>
                        <td className="py-2 pr-4 text-gray-600 text-xs max-w-[300px]">
                          {row.outcome.reason}
                        </td>
                        <td className="py-2 text-xs">
                          <EvidenceLinks links={row.outcome.evidenceLinks} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {brEval.snapshotFetchedAt && (
              <div className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                <span className="font-medium text-gray-700">Source of Truth:</span>{" "}
                AICIS Banned/Restricted evidence sources &mdash;{" "}
                fetched {new Date(brEval.snapshotFetchedAt).toLocaleString()}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </>
  );
}

/** Modal for uploading official evidence PDFs */
function UploadEvidenceModal({
  saving,
  onImport,
  onClose,
}: {
  saving: boolean;
  onImport: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [filesByType, setFilesByType] = useState<Record<string, File | null>>({});

  const hasFiles = Object.values(filesByType).some(Boolean);

  function handleFileChange(linkType: string, file: File | null) {
    setFilesByType((prev) => ({ ...prev, [linkType]: file }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const fd = new FormData();
    const metadata: { linkType: string; sourceUrl: string }[] = [];

    for (const artifact of EVIDENCE_ARTIFACTS) {
      const file = filesByType[artifact.linkType];
      if (!file) continue;
      fd.append("files", file);
      metadata.push({
        linkType: artifact.linkType,
        sourceUrl: artifact.sourceUrl,
      });
    }

    if (metadata.length === 0) return;
    fd.append("metadata", JSON.stringify(metadata));
    onImport(fd);
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Upload Evidence PDFs (Offline Mode)
          </h3>
          <p className="text-sm text-gray-600">
            Upload PDF prints of the official AICIS evidence pages. CAS numbers will be
            extracted and indexed for banned/restricted scrutiny. At least one evidence
            source (not just the hub) is required.
          </p>

          <div className="space-y-3">
            {EVIDENCE_ARTIFACTS.map((artifact) => (
              <div key={artifact.linkType} className="border border-gray-200 rounded-lg p-3">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {artifact.label}
                </label>
                <div className="text-xs text-gray-400 mb-1 truncate" title={artifact.sourceUrl}>
                  {artifact.sourceUrl}
                </div>
                <input
                  type="file"
                  accept=".pdf,.html,.htm,.txt"
                  className={inputCls}
                  onChange={(e) =>
                    handleFileChange(artifact.linkType, e.target.files?.[0] ?? null)
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !hasFiles}>
              {saving ? "Importing..." : "Import Artifacts"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Modal for uploading offline evidence pack (simple multi-file, auto link-type inference) */
function OfflineEvidencePackModal({
  saving,
  onIngest,
  onClose,
}: {
  saving: boolean;
  onIngest: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [snapshotName, setSnapshotName] = useState(
    `AU_BR_${new Date().toISOString().slice(0, 10).replace(/-/g, "_")}`,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return;

    const fd = new FormData();
    for (const file of files) {
      fd.append("files", file);
    }
    fd.append("snapshotName", snapshotName);
    onIngest(fd);
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Upload Offline Evidence Pack
          </h3>
          <p className="text-sm text-gray-600">
            Upload PDF files from AICIS, Rotterdam, Stockholm, Minamata, or Poisons Standard.
            Link types are auto-detected from filenames. CAS numbers are extracted and indexed.
          </p>
          <div className="text-xs text-gray-400 rounded bg-gray-50 px-3 py-2">
            Filename hints: include &quot;poisons&quot;/&quot;susmp&quot; for Poisons Standard,
            &quot;rotterdam&quot; for Rotterdam, &quot;minamata&quot;/&quot;mercury&quot; for Minamata,
            &quot;stockholm&quot;/&quot;pop&quot; for Stockholm, &quot;banned&quot;/&quot;restricted&quot; for Hub.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Snapshot Name
            </label>
            <input
              type="text"
              className={inputCls}
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Evidence Files (PDF, HTML, TXT)
            </label>
            <input
              type="file"
              accept=".pdf,.html,.htm,.txt"
              multiple
              className={inputCls}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                {files.map((f, i) => (
                  <div key={i}>{f.name} ({(f.size / 1024).toFixed(0)} KB)</div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || files.length === 0}>
              {saving ? "Ingesting..." : `Ingest ${files.length} File(s)`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Modal for uploading restricted chemicals CSV */
function RestrictedCsvUploadModal({
  saving,
  onUpload,
  onClose,
}: {
  saving: boolean;
  onUpload: (formData: FormData) => void;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("AU Restricted Chemicals");
  const [versionLabel, setVersionLabel] = useState(new Date().toISOString().slice(0, 10));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    const fd = new FormData();
    fd.append("file", file);
    fd.append("name", name);
    fd.append("versionLabel", versionLabel);
    onUpload(fd);
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Upload Restricted Chemicals CSV
          </h3>
          <p className="text-sm text-gray-600">
            Upload a CSV file with columns: casNo, chemicalName, status, reason.
            Status values: BANNED, RESTRICTED, LISTED, NOT_LISTED, UNKNOWN.
            This replaces any existing active dataset.
          </p>
          <div className="text-xs text-gray-400 rounded bg-gray-50 px-3 py-2">
            Or upload a ZIP file containing manifest.json + restricted_index.csv.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Dataset Name
            </label>
            <input
              type="text"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Version Label
            </label>
            <input
              type="text"
              className={inputCls}
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              CSV or ZIP File
            </label>
            <input
              type="file"
              accept=".csv,.zip"
              className={inputCls}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <div className="mt-1 text-xs text-gray-500">
                {file.name} ({(file.size / 1024).toFixed(0)} KB)
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !file}>
              {saving ? "Uploading..." : "Upload Dataset"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EvidenceLinks({ links }: { links: { label: string; url: string }[] }) {
  if (links.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {links.map((l, i) => {
        const path = toInternalPath(l.url);
        const external = isExternalUrl(path);
        return external ? (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline truncate max-w-[250px]"
            title={l.label}
          >
            {l.label}
          </a>
        ) : (
          <Link
            key={i}
            to={path}
            className="text-blue-600 hover:underline truncate max-w-[250px]"
            title={l.label}
          >
            {l.label}
          </Link>
        );
      })}
    </span>
  );
}

function CountChip({
  label,
  count,
  variant,
}: {
  label: string;
  count: number;
  variant: "success" | "warning" | "error" | "neutral";
}) {
  const colors = {
    success: "bg-green-50 text-green-700 border-green-200",
    warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
    error: "bg-red-50 text-red-700 border-red-200",
    neutral: "bg-gray-50 text-gray-700 border-gray-200",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${colors[variant]}`}>
      <span className="font-bold">{count}</span>
      {label}
    </span>
  );
}

// ── Approvals Tab ──

const CR_STATUS_VARIANT: Record<string, "success" | "warning" | "error" | "neutral"> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  APPROVED: "success",
  REJECTED: "error",
};

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  MARKETING_PLAN: "Marketing Plan",
  LAYOUT_BRIEF: "Layout Design Brief",
  COLOR_SEQUENCE: "Color Sequence",
  PACKAGING_BRIEF: "Sample Packaging Brief",
};

function ApprovalsTab({ productId }: { productId: string }) {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const { data, isLoading, error } = useComplianceRequestLatest(productId);
  const createMutation = useCreateComplianceRequest(productId);
  const eligibilityMutation = useCheckEligibility(productId);
  const approveMutation = useApproveComplianceRequest(productId);

  const [comment, setComment] = useState("");
  const [expandedArtifact, setExpandedArtifact] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState<"xlsx" | "pdf" | "csv" | null>(null);
  const [downloadingArtifactExport, setDownloadingArtifactExport] = useState<{ artifactId: string; format: "pdf" | "docx" } | null>(null);

  const handleDownloadReport = useCallback(async (format: "xlsx" | "pdf" | "csv") => {
    setDownloadingReport(format);
    try {
      const token = tokenStore.getAccessToken();
      const url = `${env.API_BASE_URL}/products/${productId}/compliance/report.${format}`;
      const resp = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        const msg = body && typeof body === "object" && "message" in body
          ? (body as { message: string }).message
          : `Download failed (${resp.status})`;
        toast("error", msg);
        return;
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      a.download = match?.[1] ?? `compliance-report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast("success", `${format.toUpperCase()} report downloaded.`);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingReport(null);
    }
  }, [productId, toast]);

  const handleDownloadArtifactExport = useCallback(
    async (artifactId: string, format: "pdf" | "docx") => {
      if (!request) return;
      setDownloadingArtifactExport({ artifactId, format });
      try {
        const token = tokenStore.getAccessToken();
        const url = `${env.API_BASE_URL}/compliance-requests/${request.id}/artifacts/${artifactId}/export.${format}`;
        const resp = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) {
          const body = await resp.json().catch(() => null);
          const msg =
            body && typeof body === "object" && "message" in body
              ? (body as { message: string }).message
              : `Download failed (${resp.status})`;
          toast("error", msg);
          return;
        }
        const blob = await resp.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        const disposition = resp.headers.get("Content-Disposition") ?? "";
        const match = disposition.match(/filename="?([^"]+)"?/);
        a.download = match?.[1] ?? `artifact.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        toast("success", `${format === "pdf" ? "PDF" : "Word"} downloaded.`);
      } catch (err) {
        toast("error", err instanceof Error ? err.message : "Download failed");
      } finally {
        setDownloadingArtifactExport(null);
      }
    },
    [request, toast],
  );

  const is404 =
    error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: number }).status === 404;

  const request: ComplianceRequestType | null = data?.request ?? null;

  function handleCreate() {
    createMutation.mutate(undefined, {
      onSuccess: () => toast("success", "Compliance request created."),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Failed to create request"),
    });
  }

  function handleCheckEligibility() {
    if (!request) return;
    eligibilityMutation.mutate(request.id, {
      onSuccess: (res) => {
        // Approval readiness depends only on Banned/Restricted status
        const brStatus = res.report3?.bannedRestrictedStatus;
        if (brStatus === "PASS") {
          toast("success", "Banned/Restricted passed. Ready for admin approval.");
        } else if (brStatus === "NEEDS_REVIEW") {
          toast("error", "Banned/Restricted needs review. Resolve before approval.");
        } else if (brStatus === "FAIL") {
          toast("error", "Banned/Restricted failed. Cannot approve.");
        } else {
          const failed = res.report.checks.filter((c) => !c.passed).length;
          toast("error", `${failed} check(s) need attention. See details below.`);
        }
      },
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Eligibility check failed"),
    });
  }

  function handleApprove() {
    if (!request) return;
    approveMutation.mutate(
      { requestId: request.id, comment: comment.trim() || undefined },
      {
        onSuccess: (res) => {
          setComment("");
          toast(
            "success",
            `Approved! ${res.artifacts.length} artifact(s) generated.`,
          );
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Approval failed"),
      },
    );
  }

  // No request exists
  if (!request && (is404 || (!isLoading && !error))) {
    return (
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Compliance Approvals</h3>
          <p className="text-sm text-gray-500">
            No compliance request exists for this product. Create one to start the approval
            workflow.
          </p>
          <Can permission="compliance:write">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Creating..." : "Create Compliance Request"}
            </Button>
          </Can>
        </CardBody>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-3/4" />
        </CardBody>
      </Card>
    );
  }

  if (error && !is404) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-red-600">Failed to load compliance request.</p>
        </CardBody>
      </Card>
    );
  }

  if (!request) return null;

  const report = request.eligibilityReportJson;
  // Approval readiness: only Banned/Restricted gates approval.
  // Ingredient Matching and AICIS are informational only.
  const approvalReady = request.bannedRestrictedStatus === "PASS" && !!request.checkedAt;
  const isReadyForApproval = approvalReady;
  const isApproved = request.eligibilityStatus === "APPROVED" || request.status === "APPROVED";

  return (
    <div className="space-y-4">
      {/* Status card */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Compliance Request</h3>
            <div className="flex items-center gap-2">
              <Badge variant={CR_STATUS_VARIANT[request.status] ?? "neutral"}>
                {request.status.replace("_", " ")}
              </Badge>
              {request.status === "DRAFT" && (
                <Can permission="compliance:write">
                  <Button
                    size="sm"
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                  >
                    New Request
                  </Button>
                </Can>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div>
              <span className="text-gray-500">Request ID:</span>{" "}
              <span className="text-gray-900 font-mono text-xs">{request.id}</span>
            </div>
            <div>
              <span className="text-gray-500">Created by:</span>{" "}
              <span className="text-gray-900">{request.createdBy.fullName}</span>
            </div>
            <div>
              <span className="text-gray-500">Upload:</span>{" "}
              <span className="text-gray-900">{request.upload.fileName}</span>
            </div>
            <div>
              <span className="text-gray-500">Regions:</span>{" "}
              <span className="text-gray-900">{request.regionScope.join(", ")}</span>
            </div>
            <div>
              <span className="text-gray-500">AICIS Snapshot:</span>{" "}
              <span className="text-gray-900 font-mono text-xs">
                {request.aicisSnapshotId ? request.aicisSnapshotId.slice(0, 12) + "..." : "None"}
              </span>
            </div>
            <div>
              <span className="text-gray-500">B/R Snapshot:</span>{" "}
              <span className="text-gray-900 font-mono text-xs">
                {request.bannedRestrictedSnapshotId
                  ? request.bannedRestrictedSnapshotId.slice(0, 12) + "..."
                  : "None"}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Eligibility checks */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Eligibility Checks</h3>
            {request.status !== "APPROVED" && (
              <Can permission="compliance:write">
                <Button
                  size="sm"
                  onClick={handleCheckEligibility}
                  disabled={eligibilityMutation.isPending}
                >
                  {eligibilityMutation.isPending
                    ? "Checking..."
                    : report
                      ? "Re-run Checks"
                      : "Run Eligibility Check"}
                </Button>
              </Can>
            )}
          </div>

          {!report ? (
            <p className="text-sm text-gray-500">
              No eligibility check has been run yet. Click &quot;Run Eligibility Check&quot; to
              verify all compliance requirements.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Overall eligibility badge */}
              <div className="flex items-center gap-2">
                {(() => {
                  const es = request.eligibilityStatus;
                  if (es === "APPROVED") return <Badge variant="success">APPROVED</Badge>;
                  if (es === "READY_FOR_APPROVAL") return <Badge variant="success">READY FOR APPROVAL</Badge>;
                  if (es === "ELIGIBLE_WITH_WARNINGS") return <Badge variant="warning">WARNINGS — NOT READY</Badge>;
                  if (es === "NOT_ELIGIBLE") return <Badge variant="error">NOT ELIGIBLE</Badge>;
                  // legacy fallback
                  if (es === "ELIGIBLE") return <Badge variant="success">READY FOR APPROVAL</Badge>;
                  return <Badge variant={report.eligible ? "success" : "error"}>{report.eligible ? "READY" : "NOT ELIGIBLE"}</Badge>;
                })()}
                <span className="text-xs text-gray-500">
                  Checked: {new Date(request.checkedAt ?? report.checkedAt).toLocaleString()}
                </span>
              </div>

              {/* Per-check status chips */}
              {request.eligibilityStatus && (
                <div className="flex flex-wrap gap-2">
                  {([
                    { label: "Ingredients (Info)", status: request.ingredientMatchingStatus, informational: true },
                    { label: "AICIS (Info)", status: request.aicisScrutinyStatus, informational: true },
                    { label: "Banned/Restricted", status: request.bannedRestrictedStatus, informational: false },
                  ] as { label: string; status: CheckStatus | null; informational: boolean }[]).map((item) => {
                    // Informational checks: always show as neutral/info style (never red)
                    const variant = item.informational
                      ? (item.status === "PASS" ? "success" : "warning")
                      : (item.status === "PASS" ? "success" : item.status === "NEEDS_REVIEW" ? "warning" : "error");
                    const icon = item.informational
                      ? (item.status === "PASS" ? "\u2705" : "\u2139\uFE0F")
                      : (item.status === "PASS" ? "\u2705" : item.status === "NEEDS_REVIEW" ? "\u26A0\uFE0F" : "\u274C");
                    return (
                      <span key={item.label} className="inline-flex items-center gap-1 text-xs">
                        <Badge variant={variant}>{icon} {item.label}: {item.status ?? "N/A"}</Badge>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Check details */}
              <div className="space-y-1">
                {report.checks.map((check) => {
                  const isInformational = check.key === "ingredient_matching" || check.key === "aicis_scrutiny";
                  const checkIcon = check.passed ? "\u2705" : "\u274C";
                  const checkColor = check.passed ? "text-green-600" : "text-red-500";
                  // Try to get 3-state status from new fields
                  const checkStatus3 = check.key === "ingredient_matching" ? request.ingredientMatchingStatus
                    : check.key === "aicis_scrutiny" ? request.aicisScrutinyStatus
                    : check.key === "banned_restricted" ? request.bannedRestrictedStatus
                    : null;
                  // Informational checks: never show red — use blue info icon for non-PASS
                  const icon3 = isInformational
                    ? (checkStatus3 === "PASS" ? "\u2705" : "\u2139\uFE0F")
                    : (checkStatus3 === "PASS" ? "\u2705" : checkStatus3 === "NEEDS_REVIEW" ? "\u26A0\uFE0F" : checkStatus3 === "FAIL" ? "\u274C" : checkIcon);
                  const color3 = isInformational
                    ? (checkStatus3 === "PASS" ? "text-green-600" : "text-blue-500")
                    : (checkStatus3 === "PASS" ? "text-green-600" : checkStatus3 === "NEEDS_REVIEW" ? "text-amber-500" : checkStatus3 === "FAIL" ? "text-red-500" : checkColor);
                  const borderClass = isInformational
                    ? "border-blue-100 bg-blue-50/30"
                    : "border-gray-200";

                  return (
                    <div
                      key={check.key}
                      className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${borderClass}`}
                    >
                      <span className={`mt-0.5 text-sm ${color3}`}>
                        {icon3}
                      </span>
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">
                          {check.label}
                        </span>
                        {isInformational && checkStatus3 !== "PASS" && (
                          <span className="ml-2 text-xs text-blue-500 font-normal">Does not block approval</span>
                        )}
                        <p className="text-xs text-gray-600 mt-0.5">{check.reason}</p>
                        {check.evidenceLinks.length > 0 && (
                          <div className="mt-1 flex gap-2">
                            {check.evidenceLinks.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                Evidence {i + 1}
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Issues list */}
              {request.issuesJson && request.issuesJson.length > 0 && (
                <div className="mt-2">
                  <h4 className="text-xs font-semibold text-gray-700 mb-1">Issues ({request.issuesJson.length})</h4>
                  <div className="space-y-1">
                    {request.issuesJson.map((issue, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className={issue.severity === "ERROR" ? "text-red-500" : issue.severity === "WARNING" ? "text-amber-500" : "text-blue-500"}>
                          {issue.severity === "ERROR" ? "\u274C" : issue.severity === "WARNING" ? "\u26A0\uFE0F" : "\u2139\uFE0F"}
                        </span>
                        <span className="text-gray-700">
                          {issue.ingredientName && <strong>{issue.ingredientName}: </strong>}
                          {issue.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evidence required */}
              {request.evidenceRequiredJson && request.evidenceRequiredJson.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <h4 className="text-xs font-semibold text-amber-800 mb-1">Evidence Required ({request.evidenceRequiredJson.length} items)</h4>
                  <div className="space-y-2">
                    {request.evidenceRequiredJson.map((ev, i) => (
                      <div key={i} className="text-xs">
                        <span className="font-medium text-gray-900">{ev.ingredientName}</span>
                        <p className="text-gray-600 mt-0.5">{ev.reason}</p>
                        <ul className="mt-1 list-disc list-inside text-gray-600">
                          {ev.requiredDocuments.map((doc, j) => (
                            <li key={j}>{doc}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Download report buttons */}
              <div className="mt-3 flex gap-2 border-t border-gray-200 pt-3">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadReport("xlsx")}
                  disabled={downloadingReport !== null}
                >
                  {downloadingReport === "xlsx" ? "Downloading..." : "Download Excel Report"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadReport("pdf")}
                  disabled={downloadingReport !== null}
                >
                  {downloadingReport === "pdf" ? "Downloading..." : "Download PDF Report"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleDownloadReport("csv")}
                  disabled={downloadingReport !== null}
                >
                  {downloadingReport === "csv" ? "Downloading..." : "Download CSV Report"}
                </Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Resolve Ingredients panel — show whenever ingredient matching is not PASS (informational, does not block approval) */}
      {report && request.ingredientMatchingStatus !== "PASS" && request.eligibilityStatus !== "APPROVED" && (
        <ResolveIngredientsPanel
          requestId={request.id}
          productId={productId}
          requestStatus={request.status}
        />
      )}

      {/* Admin Approval */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Admin Approval</h3>

          {isApproved ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
              <Badge variant="success">APPROVED</Badge>
              <span className="text-sm text-gray-900">
                by {request.approvedBy?.fullName ?? "Admin"}
              </span>
              {request.approvedAt && (
                <span className="text-xs text-gray-500">
                  on {new Date(request.approvedAt).toLocaleString()}
                </span>
              )}
            </div>
          ) : isReadyForApproval ? (
            <>
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                <Badge variant="success">READY FOR APPROVAL</Badge>
                <span className="text-sm text-gray-600">
                  Banned/Restricted check passed. Awaiting admin approval.
                </span>
              </div>

              {currentUser?.email?.toLowerCase() === "uma@thelunivaaqgroup.com" ? (
                <div className="border-t border-gray-200 pt-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Comment (optional)
                    </label>
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Add a comment with your approval..."
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleApprove()}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? "Approving..." : "Approve Compliance Request"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-sm text-amber-800">
                    Pending Admin Approval — only Uma Sharma can approve this request.
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                <Badge variant="neutral">NOT READY</Badge>
                <span className="text-sm text-gray-600">
                  {!request.checkedAt
                    ? "Run compliance checks first."
                    : request.bannedRestrictedStatus === "FAIL"
                      ? "Banned/Restricted Scrutiny failed."
                      : request.bannedRestrictedStatus === "NEEDS_REVIEW"
                        ? "Banned/Restricted Scrutiny needs review."
                        : "Run compliance checks first."}
                </span>
              </div>
              <div className="group relative inline-block">
                <Button
                  size="sm"
                  disabled
                  className="opacity-50 cursor-not-allowed"
                >
                  Approve Compliance Request
                </Button>
                <span className="invisible group-hover:visible absolute bottom-full left-0 mb-1 rounded bg-gray-900 px-2 py-1 text-xs text-white whitespace-nowrap">
                  {!request.checkedAt ? "Run compliance checks first" : "Banned/Restricted must pass"}
                </span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Generated Artifacts */}
      {request.artifacts.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Generated Artifacts ({request.artifacts.length})
            </h3>
            <div className="space-y-2">
              {request.artifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className="border border-gray-200 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedArtifact(
                        expandedArtifact === artifact.id ? null : artifact.id,
                      )
                    }
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {ARTIFACT_TYPE_LABELS[artifact.type] ?? artifact.type}
                      </span>
                      <Badge variant="neutral">v{artifact.versionNumber}</Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(artifact.createdAt).toLocaleString()}
                    </span>
                  </button>
                  {expandedArtifact === artifact.id && (
                    <div className="border-t border-gray-200 px-3 py-3">
                      {artifact.contentMarkdown ? (
                        <div className="space-y-2">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
                            {artifact.contentMarkdown}
                          </pre>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                navigator.clipboard.writeText(artifact.contentMarkdown!);
                                toast("success", "Copied to clipboard.");
                              }}
                            >
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const blob = new Blob([artifact.contentMarkdown!], {
                                  type: "text/markdown",
                                });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `${artifact.type.toLowerCase()}_v${artifact.versionNumber}.md`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                            >
                              Export .md
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownloadArtifactExport(artifact.id, "pdf")}
                              disabled={
                                downloadingArtifactExport?.artifactId === artifact.id &&
                                downloadingArtifactExport?.format === "pdf"
                              }
                            >
                              {downloadingArtifactExport?.artifactId === artifact.id &&
                              downloadingArtifactExport?.format === "pdf"
                                ? "Downloading..."
                                : "Download PDF"}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownloadArtifactExport(artifact.id, "docx")}
                              disabled={
                                downloadingArtifactExport?.artifactId === artifact.id &&
                                downloadingArtifactExport?.format === "docx"
                              }
                            >
                              {downloadingArtifactExport?.artifactId === artifact.id &&
                              downloadingArtifactExport?.format === "docx"
                                ? "Downloading..."
                                : "Download Word"}
                            </Button>
                          </div>
                        </div>
                      ) : artifact.contentJson ? (
                        <div className="space-y-2">
                          <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded p-3 max-h-96 overflow-y-auto">
                            {JSON.stringify(artifact.contentJson, null, 2)}
                          </pre>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                navigator.clipboard.writeText(
                                  JSON.stringify(artifact.contentJson, null, 2),
                                );
                                toast("success", "Copied to clipboard.");
                              }}
                            >
                              Copy JSON
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownloadArtifactExport(artifact.id, "pdf")}
                              disabled={
                                downloadingArtifactExport?.artifactId === artifact.id &&
                                downloadingArtifactExport?.format === "pdf"
                              }
                            >
                              {downloadingArtifactExport?.artifactId === artifact.id &&
                              downloadingArtifactExport?.format === "pdf"
                                ? "Downloading..."
                                : "Download PDF"}
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleDownloadArtifactExport(artifact.id, "docx")}
                              disabled={
                                downloadingArtifactExport?.artifactId === artifact.id &&
                                downloadingArtifactExport?.format === "docx"
                              }
                            >
                              {downloadingArtifactExport?.artifactId === artifact.id &&
                              downloadingArtifactExport?.format === "docx"
                                ? "Downloading..."
                                : "Download Word"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">No content available.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Approval comments */}
      {request.approvals.length > 0 && (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Approval History</h3>
            <div className="space-y-2">
              {request.approvals.map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-start gap-3 border-b border-gray-100 pb-2 last:border-b-0"
                >
                  <Badge
                    variant={approval.decision === "APPROVED" ? "success" : "error"}
                  >
                    {approval.decision}
                  </Badge>
                  <div className="flex-1">
                    <div className="text-sm text-gray-900">
                      {approval.approver.fullName}{" "}
                      <span className="text-gray-500">
                        ({approval.approver.role})
                      </span>
                    </div>
                    {approval.comment && (
                      <p className="text-xs text-gray-600 mt-0.5 italic">
                        "{approval.comment}"
                      </p>
                    )}
                    <span className="text-xs text-gray-400">
                      {new Date(approval.decidedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Manufacturing Tab ──

const BATCH_STATUS_VARIANTS: Record<string, "success" | "warning" | "neutral"> = {
  CREATED: "warning",
  RELEASED: "success",
};

function ManufacturingTab({ productId, stage }: { productId: string; stage: ProductStage }) {
  const { toast } = useToast();
  const approveMutation = useApproveManufacturing(productId);
  const isApprovedOrBeyond = [
    "MANUFACTURING_APPROVED", "BATCH_CREATED", "BATCH_RELEASED", "READY_FOR_SALE", "LIVE",
  ].includes(stage);
  const { data: maxData, isLoading: maxLoading } = useMaxProducible(productId, isApprovedOrBeyond);
  const createBatchMutation = useCreateBatch(productId);
  const { data: batchesData, isLoading: batchesLoading } = useBatches(productId);
  const releaseMutation = useReleaseBatch(productId);

  const [showBatchForm, setShowBatchForm] = useState(false);
  const [batchQty, setBatchQty] = useState("");

  const batches: Batch[] = batchesData?.batches ?? [];
  const maxProducibleKg = maxData?.maxProducibleKg ?? 0;

  function handleApprove() {
    approveMutation.mutate(undefined, {
      onSuccess: () => toast("success", "Manufacturing approved."),
      onError: (err) => toast("error", err instanceof Error ? err.message : "Approval failed"),
    });
  }

  function handleCreateBatch() {
    const qty = Number(batchQty);
    if (!qty || qty <= 0) return;
    createBatchMutation.mutate(qty, {
      onSuccess: () => {
        toast("success", "Batch created.");
        setShowBatchForm(false);
        setBatchQty("");
      },
      onError: (err) => toast("error", err instanceof Error ? err.message : "Batch creation failed"),
    });
  }

  function handleRelease(batchId: string) {
    releaseMutation.mutate(batchId, {
      onSuccess: () => toast("success", "Batch released."),
      onError: (err) => toast("error", err instanceof Error ? err.message : "Release failed"),
    });
  }

  return (
    <div className="space-y-4">
      {/* A) Stage panel */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Manufacturing Status</h3>
          <div className="flex items-center gap-3">
            <Badge variant={STAGE_COLORS[stage]}>{STAGE_LABELS[stage]}</Badge>
            {stage === "PACKAGING_READY" && (
              <Can permission="manufacturing:approve">
                <Button
                  size="sm"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? "Approving..." : "Approve Manufacturing"}
                </Button>
              </Can>
            )}
          </div>
          {stage === "PACKAGING_READY" && (
            <p className="text-xs text-gray-500">
              Approving manufacturing confirms the product is ready for batch production.
            </p>
          )}
        </CardBody>
      </Card>

      {/* B) Max Producible card */}
      {isApprovedOrBeyond && (
        <Card>
          <CardBody className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Max Producible</h3>
            {maxLoading ? (
              <SkeletonLine className="h-6 w-32" />
            ) : (
              <p className="text-2xl font-bold text-gray-900">
                {maxProducibleKg.toFixed(2)} <span className="text-sm font-normal text-gray-500">kg</span>
              </p>
            )}
            <p className="text-xs text-gray-500">
              Based on current raw material inventory and active formulation FIFO calculation.
            </p>
          </CardBody>
        </Card>
      )}

      {/* C) Create Batch */}
      {stage === "MANUFACTURING_APPROVED" && (
        <Can permission="batches:write">
          <Card>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Create Batch</h3>
                {!showBatchForm && (
                  <Button size="sm" onClick={() => setShowBatchForm(true)}>New Batch</Button>
                )}
              </div>
              {showBatchForm && (
                <div className="flex items-end gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Production Quantity (kg) *
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max={maxProducibleKg}
                      value={batchQty}
                      onChange={(e) => setBatchQty(e.target.value)}
                      className="w-48 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={`Max ${maxProducibleKg.toFixed(2)}`}
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCreateBatch}
                    disabled={createBatchMutation.isPending || !batchQty || Number(batchQty) <= 0}
                  >
                    {createBatchMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { setShowBatchForm(false); setBatchQty(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </CardBody>
          </Card>
        </Can>
      )}

      {/* D) Batches list */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Batches</h3>
          {batchesLoading ? (
            <div className="space-y-2">
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-3/4" />
            </div>
          ) : batches.length === 0 ? (
            <p className="text-sm text-gray-500">No batches created yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-4">Batch #</th>
                    <th className="py-2 pr-4">Qty (kg)</th>
                    <th className="py-2 pr-4">Mfg Date</th>
                    <th className="py-2 pr-4">Expiry</th>
                    <th className="py-2 pr-4">Formulation</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Created By</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="py-2 pr-4 font-medium text-gray-900">{batch.batchNumber}</td>
                      <td className="py-2 pr-4 text-gray-700">{batch.productionQuantityKg.toFixed(2)}</td>
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(batch.manufacturingDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {new Date(batch.expiryDate).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4 text-gray-600">
                        {batch.formulationVersion ? `v${batch.formulationVersion.versionNumber}` : "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge variant={BATCH_STATUS_VARIANTS[batch.status] ?? "neutral"}>
                          {batch.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-4 text-gray-600">{batch.createdBy.fullName}</td>
                      <td className="py-2">
                        {batch.status === "CREATED" && (
                          <Can permission="batches:write">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleRelease(batch.id)}
                              disabled={releaseMutation.isPending}
                            >
                              {releaseMutation.isPending ? "Releasing..." : "Release"}
                            </Button>
                          </Can>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ── Brand / Range Card ──

function BrandRangeCard({
  productId,
  brand,
  rangeName,
}: {
  productId: string;
  brand: string | null;
  rangeName: string;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateProduct(productId);
  const [editing, setEditing] = useState(false);
  const [brandVal, setBrandVal] = useState(brand ?? "");

  function handleSave() {
    updateMutation.mutate(
      { brand: brandVal.trim() || null },
      {
        onSuccess: () => {
          toast("success", "Brand updated.");
          setEditing(false);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Update failed"),
      },
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Brand & Range</h3>
          {!editing && (
            <Can permission="products:write">
              <Button size="sm" variant="secondary" onClick={() => { setEditing(true); setBrandVal(brand ?? ""); }}>
                Edit
              </Button>
            </Can>
          )}
        </div>
        {editing ? (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Brand</label>
              <input className={inputCls} value={brandVal} onChange={(e) => setBrandVal(e.target.value)} placeholder="e.g. Natureaallyy" />
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Range:</span>{" "}
              <span className="text-gray-900">{rangeName}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <div>
              <span className="text-gray-500">Brand:</span>{" "}
              <span className="text-gray-900">{brand || "—"}</span>
            </div>
            <div>
              <span className="text-gray-500">Range:</span>{" "}
              <span className="text-gray-900">{rangeName}</span>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Formulation Upload Card ──

function FormulationUploadCard({
  product,
  productId,
  uploading,
  replacing,
  onUploadClick,
  onReplaceClick,
}: {
  product: {
    hasDatasheetUpload: boolean;
    latestUpload: {
      id: string;
      fileName: string;
      createdAt: string;
      version?: number;
      rows?: unknown[];
    } | null;
    uploads?: {
      id: string;
      fileName: string;
      version: number;
      createdAt: string;
      archivedAt: string | null;
      archivedBy: { id: string; fullName: string } | null;
      createdBy: { id: string; fullName: string } | null;
      _count: { rows: number };
    }[];
  };
  productId: string;
  uploading: boolean;
  replacing: boolean;
  onUploadClick: () => void;
  onReplaceClick: () => void;
}) {
  const latestUpload = product.latestUpload;
  const hasActive = product.hasDatasheetUpload && !!latestUpload;
  const archivedUploads = product.uploads ?? [];
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Formulation Upload</h3>
          <Can permission="products:write">
            <div className="flex gap-2">
              {hasActive ? (
                <Button
                  size="sm"
                  onClick={onReplaceClick}
                  disabled={replacing || uploading}
                >
                  {replacing ? "Replacing..." : "Replace Formulation"}
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={onUploadClick}
                  disabled={uploading}
                >
                  {uploading ? "Uploading..." : "Upload Formulation"}
                </Button>
              )}
            </div>
          </Can>
        </div>

        {hasActive ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="success">ACTIVE</Badge>
              {latestUpload.version != null && (
                <span className="text-xs text-gray-500 font-medium">v{latestUpload.version}</span>
              )}
            </div>
            <div className="text-sm text-gray-600 space-y-1">
              <div>
                <span className="text-gray-500">File:</span>{" "}
                <span className="text-gray-900">{latestUpload.fileName}</span>
              </div>
              <div>
                <span className="text-gray-500">Uploaded:</span>{" "}
                <span className="text-gray-900">{new Date(latestUpload.createdAt).toLocaleString()}</span>
              </div>
              {latestUpload.rows && (
                <div>
                  <span className="text-gray-500">Ingredients extracted:</span>{" "}
                  <span className="text-gray-900">{latestUpload.rows.length}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Badge variant="error">NOT UPLOADED</Badge>
            <p className="text-xs text-gray-500">
              Upload a formulation/datasheet to begin the product lifecycle.
            </p>
          </div>
        )}

        {/* Formulation History (archived uploads) */}
        {archivedUploads.length > 0 && (
          <div className="border-t border-gray-200 pt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
              onClick={() => setShowHistory((prev) => !prev)}
            >
              <span className={`transition-transform ${showHistory ? "rotate-90" : ""}`}>&#9654;</span>
              Formulation History ({archivedUploads.length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-2">
                {archivedUploads.map((upload) => (
                  <div
                    key={upload.id}
                    className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                  >
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="neutral">v{upload.version}</Badge>
                        <span className="font-medium text-gray-900">{upload.fileName}</span>
                      </div>
                      <div>
                        {upload._count.rows} ingredients
                        {upload.archivedAt && (
                          <> &middot; Archived {new Date(upload.archivedAt).toLocaleDateString()}</>
                        )}
                        {upload.archivedBy && (
                          <> by {upload.archivedBy.fullName}</>
                        )}
                      </div>
                    </div>
                    <Badge variant="neutral">ARCHIVED</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── Formulation Upload Modal (first upload only) ──

function FormulationUploadModal({
  uploading,
  onUpload,
  onClose,
}: {
  uploading: boolean;
  onUpload: (file: File) => void;
  onClose: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFile) onUpload(selectedFile);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Upload Formulation</h3>
          <p className="text-sm text-gray-600">
            Select a formulation/datasheet file (CSV, XLSX, PDF, or image).
            A new formulation record will be created and set as active.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={fileRef}
              accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={uploading || !selectedFile}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Replace Formulation Modal ──

function ReplaceFormulationModal({
  replacing,
  currentVersion,
  currentFileName,
  onReplace,
  onClose,
}: {
  replacing: boolean;
  currentVersion: number;
  currentFileName: string;
  onReplace: (file: File) => void;
  onClose: () => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedFile) onReplace(selectedFile);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Replace Formulation</h3>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm text-amber-800">
              Replacing will archive the current formulation (<strong>v{currentVersion}</strong> &mdash; {currentFileName}) and upload a new one.
              Compliance checks will be reset and re-run automatically.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              New Formulation File <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              ref={fileRef}
              accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
              className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={replacing}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={replacing || !selectedFile}
            >
              {replacing ? "Replacing..." : "Replace & Re-run Compliance"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
