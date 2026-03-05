import { useState, useEffect } from "react";
import {
  useIdeationLatest,
  useIdeationVersions,
  useSaveIdeation,
  useActivateIdeation,
} from "../hooks/useIdeationApi";
import type { CompetitorLink, IdeationVersion } from "../types";
import { Card, CardBody } from "../../../components/Card";
import { SkeletonLine } from "../../../components/Skeleton";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";

export default function GreenfieldTab({ productId }: { productId: string }) {
  const { data: latestData, isLoading: latestLoading } = useIdeationLatest(productId);
  const active = latestData?.ideation ?? null;

  return (
    <div className="space-y-4">
      <ActiveVersionCard ideation={active} loading={latestLoading} />
      <Can permission="products:write">
        <CanvasFormCard productId={productId} active={active} />
      </Can>
      <VersionsTableCard productId={productId} />
    </div>
  );
}

// ── Active Version Card ──

function ActiveVersionCard({
  ideation,
  loading,
}: {
  ideation: IdeationVersion | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <SkeletonLine className="h-5 w-48" />
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-3/4" />
        </CardBody>
      </Card>
    );
  }

  if (!ideation) {
    return (
      <Card>
        <CardBody className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-900">Active Ideation</h3>
          <p className="text-sm text-gray-500">No ideation saved yet. Use the form below to create the first version.</p>
        </CardBody>
      </Card>
    );
  }

  const links = normalizeLinks(ideation.competitorLinksJson);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Active Ideation</h3>
          <Badge variant="success">v{ideation.versionNumber}</Badge>
          <span className="text-xs text-gray-500">
            {new Date(ideation.createdAt).toLocaleString()} by {ideation.createdBy.fullName}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 text-sm">
          {ideation.conceptNotes && (
            <FieldDisplay label="Concept Notes" value={ideation.conceptNotes} />
          )}
          {ideation.targetAudience && (
            <FieldDisplay label="Target Audience" value={ideation.targetAudience} />
          )}
          {ideation.ingredientsVision && (
            <FieldDisplay label="Ingredients Vision" value={ideation.ingredientsVision} />
          )}
          {ideation.marketPositioning && (
            <FieldDisplay label="Market Positioning" value={ideation.marketPositioning} />
          )}
          {ideation.additionalNotes && (
            <FieldDisplay label="Additional Notes" value={ideation.additionalNotes} />
          )}
          {links.length > 0 && (
            <div>
              <span className="text-gray-500 font-medium">Competitor Links:</span>
              <ul className="mt-1 space-y-1">
                {links.map((link, i) => (
                  <li key={i} className="text-blue-600">
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function FieldDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500 font-medium">{label}:</span>
      <p className="text-gray-900 whitespace-pre-wrap mt-0.5">{value}</p>
    </div>
  );
}

// ── Canvas Form Card ──

function CanvasFormCard({
  productId,
  active,
}: {
  productId: string;
  active: IdeationVersion | null;
}) {
  const { toast } = useToast();
  const saveMutation = useSaveIdeation(productId);

  const [conceptNotes, setConceptNotes] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [ingredientsVision, setIngredientsVision] = useState("");
  const [marketPositioning, setMarketPositioning] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [links, setLinks] = useState<CompetitorLink[]>([]);

  // Populate form from active version
  useEffect(() => {
    if (active) {
      resetToActive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function resetToActive() {
    if (!active) return;
    setConceptNotes(active.conceptNotes ?? "");
    setTargetAudience(active.targetAudience ?? "");
    setIngredientsVision(active.ingredientsVision ?? "");
    setMarketPositioning(active.marketPositioning ?? "");
    setAdditionalNotes(active.additionalNotes ?? "");
    setLinks(normalizeLinks(active.competitorLinksJson));
  }

  function handleSave() {
    saveMutation.mutate(
      {
        conceptNotes: conceptNotes.trim() || null,
        targetAudience: targetAudience.trim() || null,
        ingredientsVision: ingredientsVision.trim() || null,
        marketPositioning: marketPositioning.trim() || null,
        additionalNotes: additionalNotes.trim() || null,
        competitorLinks: links.length > 0 ? links : null,
      },
      {
        onSuccess: (res) => {
          toast("success", `Saved as version v${res.ideation.versionNumber}`);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Failed to save ideation"),
      },
    );
  }

  function addLink() {
    setLinks([...links, { label: "", url: "" }]);
  }

  function removeLink(index: number) {
    setLinks(links.filter((_, i) => i !== index));
  }

  function updateLink(index: number, field: "label" | "url", value: string) {
    setLinks(links.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";

  return (
    <Card>
      <CardBody className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-900">Ideation Canvas</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Concept Notes</label>
            <textarea
              className={inputCls}
              rows={3}
              value={conceptNotes}
              onChange={(e) => setConceptNotes(e.target.value)}
              placeholder="What product are you planning?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Target Audience</label>
            <textarea
              className={inputCls}
              rows={2}
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="Who is this product for?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients Vision</label>
            <textarea
              className={inputCls}
              rows={2}
              value={ingredientsVision}
              onChange={(e) => setIngredientsVision(e.target.value)}
              placeholder="Key ingredients and formulation approach"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Market Positioning</label>
            <textarea
              className={inputCls}
              rows={2}
              value={marketPositioning}
              onChange={(e) => setMarketPositioning(e.target.value)}
              placeholder="How will this product be positioned?"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Additional Notes</label>
            <textarea
              className={inputCls}
              rows={2}
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              placeholder="Any other notes"
            />
          </div>

          {/* Competitor Links Editor */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-700">Competitor Links</label>
              <Button type="button" size="sm" variant="secondary" onClick={addLink}>
                Add Link
              </Button>
            </div>
            {links.length === 0 && (
              <p className="text-xs text-gray-400">No competitor links added.</p>
            )}
            <div className="space-y-2">
              {links.map((link, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputCls}
                    placeholder="Label"
                    value={link.label}
                    onChange={(e) => updateLink(i, "label", e.target.value)}
                  />
                  <input
                    className={inputCls}
                    placeholder="https://..."
                    value={link.url}
                    onChange={(e) => updateLink(i, "url", e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => removeLink(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving..." : "Save New Version"}
          </Button>
          {active && (
            <Button variant="secondary" onClick={resetToActive}>
              Reset to Active
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

// ── Versions Table Card ──

function VersionsTableCard({ productId }: { productId: string }) {
  const { data, isLoading } = useIdeationVersions(productId);
  const { toast } = useToast();
  const activateMutation = useActivateIdeation(productId);

  const versions: IdeationVersion[] = data?.versions ?? [];

  function handleActivate(ideationId: string, versionNumber: number) {
    activateMutation.mutate(ideationId, {
      onSuccess: () => toast("success", `Version v${versionNumber} activated.`),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Activation failed"),
    });
  }

  return (
    <Card>
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Version History</h3>
        {isLoading ? (
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-3/4" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-gray-500">No versions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-4">Version</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">By</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {versions.map((v) => (
                  <tr key={v.id} className={v.isActive ? "bg-blue-50/30" : ""}>
                    <td className="py-2 pr-4 font-medium text-gray-900">v{v.versionNumber}</td>
                    <td className="py-2 pr-4">
                      {v.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="neutral">Inactive</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">
                      {new Date(v.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-gray-600">{v.createdBy.fullName}</td>
                    <td className="py-2">
                      {!v.isActive && (
                        <Can permission="products:write">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={activateMutation.isPending}
                            onClick={() => handleActivate(v.id, v.versionNumber)}
                          >
                            Activate
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
  );
}

// ── Helpers ──

function normalizeLinks(json: unknown): CompetitorLink[] {
  if (!Array.isArray(json)) return [];
  return json.filter(
    (item): item is CompetitorLink =>
      typeof item === "object" &&
      item !== null &&
      typeof item.label === "string" &&
      typeof item.url === "string",
  );
}
