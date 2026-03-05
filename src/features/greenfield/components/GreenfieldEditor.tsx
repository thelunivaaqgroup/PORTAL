import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  useUpdateGreenfield,
  useMarkReady,
  useArchiveGreenfield,
  useConvertGreenfield,
} from "../hooks/useGreenfieldApi";
import type { GreenfieldIdea, ConvertGreenfieldPayload } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";
import { Card, CardBody } from "../../../components/Card";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Can from "../../../components/Can";
import { useToast } from "../../../context/useToast";
import ConvertModal from "./ConvertModal";

type Props = {
  idea: GreenfieldIdea;
};

export default function GreenfieldEditor({ idea }: Props) {
  const { toast } = useToast();
  const updateMutation = useUpdateGreenfield();
  const markReadyMutation = useMarkReady();
  const archiveMutation = useArchiveGreenfield();
  const convertMutation = useConvertGreenfield();

  const [title, setTitle] = useState(idea.title);
  const [conceptNotes, setConceptNotes] = useState(idea.conceptNotes ?? "");
  const [targetAudience, setTargetAudience] = useState(idea.targetAudience ?? "");
  const [ingredientsVision, setIngredientsVision] = useState(idea.ingredientsVision ?? "");
  const [marketPositioning, setMarketPositioning] = useState(idea.marketPositioning ?? "");
  const [additionalNotes, setAdditionalNotes] = useState(idea.additionalNotes ?? "");

  const [showConvert, setShowConvert] = useState(false);

  // Reset form when idea changes
  useEffect(() => {
    setTitle(idea.title);
    setConceptNotes(idea.conceptNotes ?? "");
    setTargetAudience(idea.targetAudience ?? "");
    setIngredientsVision(idea.ingredientsVision ?? "");
    setMarketPositioning(idea.marketPositioning ?? "");
    setAdditionalNotes(idea.additionalNotes ?? "");
  }, [idea.id, idea.title, idea.conceptNotes, idea.targetAudience, idea.ingredientsVision, idea.marketPositioning, idea.additionalNotes]);

  const isEditable = idea.status !== "CONVERTED" && idea.status !== "ARCHIVED";

  function handleSave() {
    updateMutation.mutate(
      {
        id: idea.id,
        body: {
          title: title.trim(),
          conceptNotes: conceptNotes.trim() || null,
          targetAudience: targetAudience.trim() || null,
          ingredientsVision: ingredientsVision.trim() || null,
          marketPositioning: marketPositioning.trim() || null,
          additionalNotes: additionalNotes.trim() || null,
        },
      },
      {
        onSuccess: () => toast("success", "Idea saved."),
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Save failed"),
      },
    );
  }

  function handleMarkReady() {
    markReadyMutation.mutate(idea.id, {
      onSuccess: () => toast("success", "Idea marked as ready to convert."),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Failed"),
    });
  }

  function handleArchive() {
    archiveMutation.mutate(idea.id, {
      onSuccess: () => toast("success", "Idea archived."),
      onError: (err) =>
        toast("error", err instanceof Error ? err.message : "Archive failed"),
    });
  }

  function handleConvert(id: string, body: ConvertGreenfieldPayload) {
    convertMutation.mutate(
      { id, body },
      {
        onSuccess: (res) => {
          toast("success", `Converted to product "${res.product.name}"`);
          setShowConvert(false);
        },
        onError: (err) =>
          toast("error", err instanceof Error ? err.message : "Conversion failed"),
      },
    );
  }

  const inputCls =
    "w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500";
  const readOnlyCls =
    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700";

  return (
    <div className="space-y-4">
      {/* Header with status */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">{idea.title}</h2>
              <Badge variant={STATUS_COLORS[idea.status]}>
                {STATUS_LABELS[idea.status]}
              </Badge>
            </div>
            <span className="text-xs text-gray-500">
              Created {new Date(idea.createdAt).toLocaleDateString()} by {idea.createdBy.fullName}
            </span>
          </div>

          {/* Converted product link */}
          {idea.status === "CONVERTED" && idea.convertedProduct && (
            <div className="mt-3 flex items-center gap-3 rounded-lg bg-green-50 px-4 py-2">
              <span className="text-sm text-green-800">
                Converted to: <strong>{idea.convertedProduct.name}</strong> ({idea.convertedProduct.skuCode})
              </span>
              <Link to={`/products/${idea.convertedProduct.id}`}>
                <Button size="sm" variant="secondary">Go to Product</Button>
              </Link>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Editor canvas */}
      <Card>
        <CardBody className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Ideation Canvas</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
              {isEditable ? (
                <input
                  className={inputCls}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Idea title"
                />
              ) : (
                <div className={readOnlyCls}>{title || "—"}</div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Concept Notes</label>
              {isEditable ? (
                <textarea
                  className={inputCls}
                  rows={3}
                  value={conceptNotes}
                  onChange={(e) => setConceptNotes(e.target.value)}
                  placeholder="What product are you planning?"
                />
              ) : (
                <div className={readOnlyCls + " whitespace-pre-wrap min-h-[3rem]"}>
                  {conceptNotes || "—"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Target Audience</label>
              {isEditable ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Who is this product for?"
                />
              ) : (
                <div className={readOnlyCls + " whitespace-pre-wrap min-h-[2rem]"}>
                  {targetAudience || "—"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Ingredients Vision</label>
              {isEditable ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  value={ingredientsVision}
                  onChange={(e) => setIngredientsVision(e.target.value)}
                  placeholder="Key ingredients and formulation approach"
                />
              ) : (
                <div className={readOnlyCls + " whitespace-pre-wrap min-h-[2rem]"}>
                  {ingredientsVision || "—"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Market Positioning</label>
              {isEditable ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  value={marketPositioning}
                  onChange={(e) => setMarketPositioning(e.target.value)}
                  placeholder="How will this product be positioned?"
                />
              ) : (
                <div className={readOnlyCls + " whitespace-pre-wrap min-h-[2rem]"}>
                  {marketPositioning || "—"}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Additional Notes</label>
              {isEditable ? (
                <textarea
                  className={inputCls}
                  rows={2}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="Any other notes"
                />
              ) : (
                <div className={readOnlyCls + " whitespace-pre-wrap min-h-[2rem]"}>
                  {additionalNotes || "—"}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          {isEditable && (
            <Can permission="greenfield:write">
              <div className="flex flex-wrap gap-2 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={updateMutation.isPending || !title.trim()}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>

                {idea.status === "DRAFT" && (
                  <Button
                    variant="secondary"
                    onClick={handleMarkReady}
                    disabled={markReadyMutation.isPending}
                  >
                    {markReadyMutation.isPending ? "Marking..." : "Mark Ready"}
                  </Button>
                )}

                <Can permission="greenfield:convert">
                  {idea.status !== "ARCHIVED" && (
                    <Button
                      variant="secondary"
                      onClick={() => setShowConvert(true)}
                    >
                      Convert to Product
                    </Button>
                  )}
                </Can>

                <Button
                  variant="secondary"
                  onClick={handleArchive}
                  disabled={archiveMutation.isPending}
                >
                  {archiveMutation.isPending ? "Archiving..." : "Archive"}
                </Button>
              </div>
            </Can>
          )}
        </CardBody>
      </Card>

      {/* Convert Modal */}
      <ConvertModal
        idea={showConvert ? idea : null}
        loading={convertMutation.isPending}
        onClose={() => setShowConvert(false)}
        onConvert={handleConvert}
      />
    </div>
  );
}
