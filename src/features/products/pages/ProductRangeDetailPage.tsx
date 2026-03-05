import { useState, type FormEvent } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useProductsByRange,
  useCreateProduct,
  useQuickUpdateProduct,
  useDeleteProduct,
  useRanges,
} from "../hooks/useProductsApi";
import type { Product, ProductStage, CreateProductPayload, UpdateProductPayload, ProductRange } from "../types";
import { STAGE_LABELS } from "../types";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import Can from "../../../components/Can";
import PageError from "../../../components/PageError";
import EmptyState from "../../../components/EmptyState";
import { SkeletonLine } from "../../../components/Skeleton";
import Pagination from "../../../components/Pagination";
import { useToast } from "../../../context/useToast";

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

const REGIONS = ["AU", "EU", "US"];
const COL_HEADERS = ["Serial No.", "Product Name", "Brand", "Datasheet", "Stage", ""];

export default function ProductRangeDetailPage() {
  const { rangeId } = useParams<{ rangeId: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: rangesData } = useRanges();
  const { data, isLoading, isError, refetch } = useProductsByRange(rangeId!);
  const createMutation = useCreateProduct();
  const quickUpdateMutation = useQuickUpdateProduct();
  const deleteMutation = useDeleteProduct();

  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const ranges = rangesData?.ranges ?? [];
  const currentRange = ranges.find((r) => r.id === rangeId);
  const products = data?.products ?? [];
  const total = products.length;
  const pageData = products.slice((page - 1) * pageSize, page * pageSize);
  const pageOffset = (page - 1) * pageSize;

  if (isError) {
    return <PageError message="Failed to load products" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to="/products" className="hover:text-blue-600">Products</Link>
        <span>/</span>
        <span className="text-gray-900 font-medium">{currentRange?.name ?? "Range"}</span>
      </div>

      <PageHeader
        title={currentRange?.name ?? "Product Range"}
        subtitle={`${total} product${total !== 1 ? "s" : ""} in this range`}
        action={
          <Can permission="products:write">
            <Button onClick={() => setCreateOpen(true)}>Add Product</Button>
          </Can>
        }
      />

      {isLoading ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
            <thead className="bg-gray-50">
              <tr>
                {COL_HEADERS.map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {Array.from({ length: 5 }, (_, i) => (
                <tr key={i}>
                  {COL_HEADERS.map((_, c) => (
                    <td key={c} className="px-4 py-3">
                      <SkeletonLine className={c === 0 ? "w-8" : c === 1 ? "w-2/3" : "w-1/2"} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products"
          message="Add your first product to this range."
          action={
            <Can permission="products:write">
              <Button size="sm" onClick={() => setCreateOpen(true)}>Add Product</Button>
            </Can>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 bg-white text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {COL_HEADERS.map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {pageData.map((product, idx) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 font-medium">
                      {pageOffset + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/products/${product.id}`}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {product.brand || <span className="text-gray-400">&mdash;</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {product.hasDatasheetUpload ? (
                        <span className="text-green-600" title="Datasheet uploaded">{"\u2705"}</span>
                      ) : (
                        <span className="text-red-400" title="No datasheet">{"\u274C"}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={STAGE_COLORS[product.stage]}>
                        {STAGE_LABELS[product.stage]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Can permission="products:write">
                          <Button size="sm" variant="secondary" onClick={() => setEditProduct(product)}>
                            Edit
                          </Button>
                        </Can>
                        <Can permission="products:delete">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDeleteTarget(product)}
                          >
                            Delete
                          </Button>
                        </Can>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </>
      )}

      {/* Create Product Modal */}
      <CreateProductModal
        open={createOpen}
        loading={createMutation.isPending}
        rangeId={rangeId!}
        ranges={ranges}
        onClose={() => setCreateOpen(false)}
        onSubmit={(body) => {
          createMutation.mutate(body, {
            onSuccess: (res) => {
              toast("success", `Product "${res.product.name}" created (${res.product.skuCode})`);
              setCreateOpen(false);
              navigate(`/products/${res.product.id}`);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Create failed"),
          });
        }}
      />

      {/* Quick Edit Modal */}
      <QuickEditModal
        product={editProduct}
        loading={quickUpdateMutation.isPending}
        ranges={ranges}
        onClose={() => setEditProduct(null)}
        onSubmit={(id, body) => {
          quickUpdateMutation.mutate({ id, body }, {
            onSuccess: () => {
              toast("success", "Product updated");
              setEditProduct(null);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Update failed"),
          });
        }}
      />

      {/* Delete Confirmation Modal */}
      <DeleteProductModal
        product={deleteTarget}
        loading={deleteMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={(id) => {
          deleteMutation.mutate(id, {
            onSuccess: () => {
              toast("success", "Product deleted");
              setDeleteTarget(null);
            },
            onError: (err) =>
              toast("error", err instanceof Error ? err.message : "Delete failed"),
          });
        }}
      />
    </div>
  );
}

// ── Create Product Modal ──

function CreateProductModal({
  open,
  loading,
  rangeId,
  ranges,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  rangeId: string;
  ranges: ProductRange[];
  onClose: () => void;
  onSubmit: (body: CreateProductPayload) => void;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      {open && (
        <CreateProductForm
          loading={loading}
          rangeId={rangeId}
          ranges={ranges}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Modal>
  );
}

function CreateProductForm({
  loading,
  rangeId,
  ranges,
  onClose,
  onSubmit,
}: {
  loading: boolean;
  rangeId: string;
  ranges: ProductRange[];
  onClose: () => void;
  onSubmit: (body: CreateProductPayload) => void;
}) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("Natureaallyy");
  const [selectedRangeId, setSelectedRangeId] = useState(rangeId);
  const [selectedRegions, setSelectedRegions] = useState<string[]>(["AU"]);
  const [nameError, setNameError] = useState("");
  const [brandError, setBrandError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let hasError = false;

    if (!name.trim()) {
      setNameError("Product name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    if (!brand.trim()) {
      setBrandError("Brand is required");
      hasError = true;
    } else {
      setBrandError("");
    }

    if (hasError) return;

    onSubmit({
      name: name.trim(),
      brand: brand.trim(),
      rangeId: selectedRangeId,
      targetRegions: selectedRegions,
    });
  }

  function toggleRegion(region: string) {
    setSelectedRegions((prev) =>
      prev.includes(region)
        ? prev.filter((r) => r !== region)
        : [...prev, region],
    );
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">New Product</h3>

      <Input
        label="Product Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        placeholder="e.g. Aloe Vera Radiance Gel"
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Brand <span className="text-red-500">*</span>
        </label>
        <input
          className={`w-full rounded-lg border px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            brandError ? "border-red-300" : "border-gray-300"
          }`}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Natureaallyy"
        />
        {brandError && <p className="mt-1 text-xs text-red-500">{brandError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Range (Folder)</label>
        <select
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={selectedRangeId}
          onChange={(e) => setSelectedRangeId(e.target.value)}
        >
          {ranges.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-gray-700">Target Regions</label>
        <div className="flex gap-3">
          {REGIONS.map((region) => (
            <label key={region} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedRegions.includes(region)}
                onChange={() => toggleRegion(region)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {region}
            </label>
          ))}
        </div>
        {selectedRegions.length === 0 && (
          <p className="text-xs text-red-500">Select at least one region</p>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading || selectedRegions.length === 0}>
          {loading ? "Creating..." : "Create"}
        </Button>
      </div>
    </form>
  );
}

// ── Quick Edit Modal ──

function QuickEditModal({
  product,
  loading,
  ranges,
  onClose,
  onSubmit,
}: {
  product: Product | null;
  loading: boolean;
  ranges: ProductRange[];
  onClose: () => void;
  onSubmit: (id: string, body: UpdateProductPayload) => void;
}) {
  return (
    <Modal open={!!product} onClose={onClose}>
      {product && (
        <QuickEditForm
          product={product}
          loading={loading}
          ranges={ranges}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Modal>
  );
}

function QuickEditForm({
  product,
  loading,
  ranges,
  onClose,
  onSubmit,
}: {
  product: Product;
  loading: boolean;
  ranges: ProductRange[];
  onClose: () => void;
  onSubmit: (id: string, body: UpdateProductPayload) => void;
}) {
  const [name, setName] = useState(product.name);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [selectedRangeId, setSelectedRangeId] = useState(product.rangeId);
  const [nameError, setNameError] = useState("");
  const [brandError, setBrandError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let hasError = false;

    if (!name.trim()) {
      setNameError("Product name is required");
      hasError = true;
    } else {
      setNameError("");
    }

    if (!brand.trim()) {
      setBrandError("Brand is required");
      hasError = true;
    } else {
      setBrandError("");
    }

    if (hasError) return;

    onSubmit(product.id, {
      name: name.trim(),
      brand: brand.trim(),
      rangeId: selectedRangeId,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Edit — {product.name}</h3>

      <Input
        label="Product Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Brand <span className="text-red-500">*</span>
        </label>
        <input
          className={`w-full rounded-lg border px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
            brandError ? "border-red-300" : "border-gray-300"
          }`}
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="e.g. Natureaallyy"
        />
        {brandError && <p className="mt-1 text-xs text-red-500">{brandError}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Range (Folder)</label>
        <select
          className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          value={selectedRangeId}
          onChange={(e) => setSelectedRangeId(e.target.value)}
        >
          {ranges.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={loading}>
          {loading ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ── Delete Product Confirmation ──

function DeleteProductModal({
  product,
  loading,
  onClose,
  onConfirm,
}: {
  product: Product | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}) {
  return (
    <Modal open={!!product} onClose={onClose}>
      {product && (
        <div className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Delete Product</h3>
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <strong>{product.name}</strong> ({product.skuCode})?
            This will also delete all related data and cannot be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => onConfirm(product.id)}
            >
              {loading ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
