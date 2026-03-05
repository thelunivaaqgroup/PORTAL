import { useState } from "react";
import {
  useFinishedGoodsLots,
  useFinishedGoodsSummary,
  useSetPackSpec,
  useCreateFinishedGoods,
} from "../hooks/useFinishedGoodsApi";
import { useBatches } from "../../manufacturing/hooks/useManufacturingApi";
import type { Batch } from "../../manufacturing/types";
import type { FinishedGoodLot } from "../types";
import { Card, CardBody } from "../../../components/Card";
import { SkeletonLine } from "../../../components/Skeleton";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";

const FG_STATUS_VARIANTS: Record<string, "success" | "warning" | "neutral"> = {
  AVAILABLE: "success",
  EXHAUSTED: "neutral",
};

export default function FinishedGoodsTab({
  productId,
  packNetContentMl,
  fillDensityGPerMl,
}: {
  productId: string;
  packNetContentMl: number | null;
  fillDensityGPerMl: number;
}) {
  return (
    <div className="space-y-4">
      <PackSpecCard
        productId={productId}
        packNetContentMl={packNetContentMl}
        fillDensityGPerMl={fillDensityGPerMl}
      />
      <FinishedGoodsSummaryCard productId={productId} />
      <CreateFromBatchCard productId={productId} />
      <FinishedGoodsLotsTable productId={productId} />
    </div>
  );
}

// ── Pack Spec Card ──

function PackSpecCard({
  productId,
  packNetContentMl,
  fillDensityGPerMl,
}: {
  productId: string;
  packNetContentMl: number | null;
  fillDensityGPerMl: number;
}) {
  const { toast } = useToast();
  const mutation = useSetPackSpec(productId);
  const [editing, setEditing] = useState(false);
  const [mlValue, setMlValue] = useState(String(packNetContentMl ?? ""));
  const [densityValue, setDensityValue] = useState(String(fillDensityGPerMl));

  function handleSave() {
    const ml = Number(mlValue);
    const density = Number(densityValue);
    if (!Number.isInteger(ml) || ml <= 0) {
      toast("error", "Pack content must be a positive integer (ml).");
      return;
    }
    if (density <= 0 || density > 2.0) {
      toast("error", "Fill density must be > 0 and <= 2.0 g/ml.");
      return;
    }
    mutation.mutate(
      { packNetContentMl: ml, fillDensityGPerMl: density },
      {
        onSuccess: () => {
          toast("success", "Pack spec updated.");
          setEditing(false);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Failed to update pack spec"),
      },
    );
  }

  const inputCls =
    "w-40 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Pack Specification</h3>
          {!editing && (
            <Can permission="manufacturing:approve">
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                {packNetContentMl ? "Edit" : "Configure"}
              </Button>
            </Can>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Net Content (ml) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={mlValue}
                  onChange={(e) => setMlValue(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Fill Density (g/ml) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  max="2.0"
                  step="0.01"
                  value={densityValue}
                  onChange={(e) => setDensityValue(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 1.0"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={mutation.isPending || !mlValue || !densityValue}
              >
                {mutation.isPending ? "Saving..." : "Save"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(false);
                  setMlValue(String(packNetContentMl ?? ""));
                  setDensityValue(String(fillDensityGPerMl));
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : packNetContentMl ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <span className="text-gray-500">Net Content:</span>{" "}
              <span className="text-gray-900 font-medium">{packNetContentMl} ml</span>
            </div>
            <div>
              <span className="text-gray-500">Fill Density:</span>{" "}
              <span className="text-gray-900 font-medium">{fillDensityGPerMl} g/ml</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            Pack specification not configured. Set the net content and fill density to enable finished goods calculation.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

// ── Finished Goods Summary Card ──

function FinishedGoodsSummaryCard({ productId }: { productId: string }) {
  const { data, isLoading } = useFinishedGoodsSummary(productId);

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Finished Goods Summary</h3>
        {isLoading ? (
          <SkeletonLine className="h-6 w-64" />
        ) : data ? (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.totalUnitsProduced}</p>
              <p className="text-xs text-gray-500">Total Units Produced</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.totalUnitsRemaining}</p>
              <p className="text-xs text-gray-500">Units Remaining</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data.lotsAvailableCount}</p>
              <p className="text-xs text-gray-500">Available Lots</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No summary data available.</p>
        )}
      </CardBody>
    </Card>
  );
}

// ── Create From Batch Card ──

function CreateFromBatchCard({ productId }: { productId: string }) {
  const { toast } = useToast();
  const { data: batchesData, isLoading: batchesLoading } = useBatches(productId);
  const { data: lotsData } = useFinishedGoodsLots(productId);
  const createMutation = useCreateFinishedGoods(productId);

  const batches: Batch[] = batchesData?.batches ?? [];
  const lots: FinishedGoodLot[] = lotsData?.lots ?? [];

  // Only RELEASED batches without an existing FG lot
  const existingBatchIds = new Set(lots.map((l) => l.batchId));
  const eligibleBatches = batches.filter(
    (b) => b.status === "RELEASED" && !existingBatchIds.has(b.id),
  );

  function handleCreate(batchId: string) {
    createMutation.mutate(batchId, {
      onSuccess: () => toast("success", "Finished goods lot created."),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Failed to create finished goods"),
    });
  }

  return (
    <Can permission="manufacturing:approve">
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Create Finished Goods from Batch</h3>
          {batchesLoading ? (
            <SkeletonLine className="h-4 w-full" />
          ) : eligibleBatches.length === 0 ? (
            <p className="text-sm text-gray-500">
              No eligible batches. Batches must be RELEASED and not already have a finished goods lot.
            </p>
          ) : (
            <div className="space-y-2">
              {eligibleBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      {batch.batchNumber}
                    </span>
                    <span className="text-xs text-gray-500">
                      {batch.productionQuantityKg.toFixed(2)} kg
                    </span>
                    <Badge variant="success">RELEASED</Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleCreate(batch.id)}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create FG Lot"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </Can>
  );
}

// ── Finished Goods Lots Table ──

function FinishedGoodsLotsTable({ productId }: { productId: string }) {
  const { data, isLoading } = useFinishedGoodsLots(productId);
  const lots: FinishedGoodLot[] = data?.lots ?? [];

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Finished Good Lots</h3>
        {isLoading ? (
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-3/4" />
          </div>
        ) : lots.length === 0 ? (
          <p className="text-sm text-gray-500">No finished goods lots yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-4">Batch</th>
                  <th className="py-2 pr-4">Units Produced</th>
                  <th className="py-2 pr-4">Units Remaining</th>
                  <th className="py-2 pr-4">Pack (ml)</th>
                  <th className="py-2 pr-4">Density (g/ml)</th>
                  <th className="py-2 pr-4">Fillable (ml)</th>
                  <th className="py-2 pr-4">Leftover (ml)</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lots.map((lot) => (
                  <tr key={lot.id}>
                    <td className="py-2 pr-4 font-medium text-gray-900">
                      {lot.batch.batchNumber}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">{lot.unitsProduced}</td>
                    <td className="py-2 pr-4 text-gray-700">{lot.unitsRemaining}</td>
                    <td className="py-2 pr-4 text-gray-600">{lot.packNetContentMl}</td>
                    <td className="py-2 pr-4 text-gray-600">{lot.fillDensityGPerMl}</td>
                    <td className="py-2 pr-4 text-gray-600">{lot.totalFillableMl.toFixed(2)}</td>
                    <td className="py-2 pr-4 text-gray-600">{lot.leftoverMl.toFixed(2)}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={FG_STATUS_VARIANTS[lot.status] ?? "neutral"}>
                        {lot.status}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {new Date(lot.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
