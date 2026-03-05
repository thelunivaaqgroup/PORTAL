import { useState, type FormEvent } from "react";
import {
  useGreenfieldIdeas,
  useCreateGreenfield,
} from "../hooks/useGreenfieldApi";
import type { GreenfieldIdea } from "../types";
import { STATUS_LABELS, STATUS_COLORS } from "../types";
import GreenfieldEditor from "../components/GreenfieldEditor";
import PageHeader from "../../../components/PageHeader";
import Button from "../../../components/Button";
import Badge from "../../../components/Badge";
import Modal from "../../../components/Modal";
import Input from "../../../components/Input";
import Can from "../../../components/Can";
import PageError from "../../../components/PageError";
import { SkeletonLine } from "../../../components/Skeleton";
import { useToast } from "../../../context/useToast";

export default function GreenfieldPage() {
  const { toast } = useToast();
  const { data, isLoading, isError, refetch } = useGreenfieldIdeas();
  const createMutation = useCreateGreenfield();

  const ideas: GreenfieldIdea[] = data?.ideas ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newIdeaOpen, setNewIdeaOpen] = useState(false);

  const selectedIdea = ideas.find((i) => i.id === selectedId) ?? null;

  // Auto-select first if nothing selected
  if (!selectedIdea && ideas.length > 0 && !selectedId) {
    // Don't set in render — user can click
  }

  if (isError) {
    return <PageError message="Failed to load greenfield ideas" onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Greenfield"
        subtitle="Strategic ideation — before product creation"
        action={
          <Can permission="greenfield:write">
            <Button onClick={() => setNewIdeaOpen(true)}>New Idea</Button>
          </Can>
        }
      />

      <div className="flex gap-6 min-h-[calc(100vh-220px)]">
        {/* Left column — ideas list */}
        <div className="w-72 shrink-0 space-y-1">
          {isLoading ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonLine key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
              <p className="text-sm text-gray-500">No ideas yet.</p>
              <Can permission="greenfield:write">
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => setNewIdeaOpen(true)}
                >
                  Create First Idea
                </Button>
              </Can>
            </div>
          ) : (
            ideas.map((idea) => (
              <button
                key={idea.id}
                type="button"
                onClick={() => setSelectedId(idea.id)}
                className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedId === idea.id
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {idea.title}
                  </span>
                  <Badge variant={STATUS_COLORS[idea.status]}>
                    {STATUS_LABELS[idea.status]}
                  </Badge>
                </div>
                <span className="text-xs text-gray-500 mt-0.5 block">
                  {new Date(idea.updatedAt).toLocaleDateString()}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Right column — editor */}
        <div className="flex-1 min-w-0">
          {selectedIdea ? (
            <GreenfieldEditor idea={selectedIdea} />
          ) : (
            !isLoading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-gray-400">
                  {ideas.length === 0
                    ? "Create your first greenfield idea to get started."
                    : "Select an idea from the list to view or edit."}
                </p>
              </div>
            )
          )}
        </div>
      </div>

      {/* New Idea Modal */}
      <NewIdeaModal
        open={newIdeaOpen}
        loading={createMutation.isPending}
        onClose={() => setNewIdeaOpen(false)}
        onSubmit={(title) => {
          createMutation.mutate(
            { title },
            {
              onSuccess: (res) => {
                toast("success", `Idea "${res.idea.title}" created`);
                setNewIdeaOpen(false);
                setSelectedId(res.idea.id);
              },
              onError: (err) =>
                toast("error", err instanceof Error ? err.message : "Create failed"),
            },
          );
        }}
      />
    </div>
  );
}

// ── New Idea Modal ──

function NewIdeaModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (title: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");
    onSubmit(title.trim());
  }

  function handleClose() {
    setTitle("");
    setTitleError("");
    onClose();
  }

  return (
    <Modal open={open} onClose={handleClose}>
      {open && (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">New Greenfield Idea</h3>
          <Input
            label="Idea Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={titleError}
            placeholder="e.g. Aloe Vera Face Wash"
          />
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "Creating..." : "Create Idea"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
