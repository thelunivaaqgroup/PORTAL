import { useParams, Link } from "react-router-dom";
import { useBannedRestrictedSnapshot } from "../../aicis/hooks/useAicisApi";
import PageHeader from "../../../components/PageHeader";
import Badge from "../../../components/Badge";
import { Card, CardBody } from "../../../components/Card";
import { SkeletonLine } from "../../../components/Skeleton";
import PageError from "../../../components/PageError";

const FETCH_STATUS_VARIANT: Record<string, "success" | "error"> = {
  SUCCESS: "success",
  FAILED: "error",
};

export default function BannedRestrictedRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useBannedRestrictedSnapshot(id);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLine className="h-8 w-48" />
        <Card><CardBody className="space-y-2">
          <SkeletonLine className="h-5 w-full" />
          <SkeletonLine className="h-5 w-3/4" />
          <SkeletonLine className="h-5 w-1/2" />
        </CardBody></Card>
      </div>
    );
  }

  if (error || !data?.snapshot) {
    return <PageError message="Banned/Restricted record not found." />;
  }

  const snap = data.snapshot;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Banned/Restricted Snapshot"
        subtitle={`Record ${snap.id} — fetched ${new Date(snap.fetchedAt).toLocaleString()}`}
      />

      {/* Incomplete warning banner */}
      {!snap.isComplete && (
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Snapshot Incomplete.</span>{" "}
          All sources (including upstream treaty fallbacks) failed to produce indexed chemicals. No compliance conclusions can be made from this snapshot.
          {snap.sourcesSuccess === 0 && (
            <span className="block mt-1">
              All {snap.sourcesTotal} sources failed to respond. This is typically caused by
              IP-level blocking. Run the sync from a server with unrestricted internet access.
            </span>
          )}
        </div>
      )}

      {/* Metadata */}
      <Card>
        <CardBody className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Snapshot Details</h3>
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
            <div>
              <dt className="text-xs font-medium text-gray-500">Source URL</dt>
              <dd className="text-sm text-gray-900">
                <a href={snap.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                  {snap.sourceUrl}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Fetched At</dt>
              <dd className="text-sm text-gray-900">{new Date(snap.fetchedAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Content Hash</dt>
              <dd className="text-sm text-gray-900 font-mono text-xs">{snap.contentHash}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Status</dt>
              <dd className="text-sm">
                <Badge variant={snap.isComplete ? "success" : "error"}>
                  {snap.isComplete ? "Complete" : "Incomplete"}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Sources</dt>
              <dd className="text-sm text-gray-900">
                {snap.sourcesSuccess}/{snap.sourcesTotal} succeeded
                {snap.sourcesFailed > 0 && (
                  <span className="ml-1 text-red-500">({snap.sourcesFailed} failed)</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Chemicals Indexed</dt>
              <dd className="text-sm text-gray-900">{snap.chemicalsCount}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-gray-500">Notes</dt>
              <dd className="text-sm text-gray-900 whitespace-pre-wrap">{snap.notes ?? "—"}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {/* Sources table */}
      <Card>
        <CardBody className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Sources ({snap.sources.length})</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="py-2 pr-4">Source Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Size</th>
                  <th className="py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {snap.sources.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-4 text-gray-900 max-w-[300px] truncate">
                      <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                        {s.sourceName}
                      </a>
                    </td>
                    <td className="py-2 pr-4 text-gray-600 text-xs">{s.linkType}</td>
                    <td className="py-2 pr-4">
                      <Badge variant={FETCH_STATUS_VARIANT[s.fetchStatus] ?? "neutral"}>
                        {s.fetchStatus}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-gray-600 text-xs">
                      {s.rawContentSize ? `${(s.rawContentSize / 1024).toFixed(1)} KB` : "—"}
                    </td>
                    <td className="py-2 text-red-500 text-xs max-w-[400px]">
                      {s.errorMessage ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Chemicals table */}
      {snap.chemicals.length > 0 ? (
        <Card>
          <CardBody className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">
              Indexed Chemicals ({snap.chemicals.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    <th className="py-2 pr-4">CAS No.</th>
                    <th className="py-2 pr-4">Chemical Name</th>
                    <th className="py-2 pr-4">Source</th>
                    <th className="py-2">Context Snippet</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {snap.chemicals.map((c) => {
                    const source = snap.sources.find((s) => s.id === c.sourceId);
                    return (
                      <tr key={c.id}>
                        <td className="py-2 pr-4 font-mono text-xs text-gray-900">{c.normalizedCasNo}</td>
                        <td className="py-2 pr-4 text-gray-700">{c.chemicalName ?? "—"}</td>
                        <td className="py-2 pr-4 text-gray-600 text-xs max-w-[200px] truncate">
                          {source?.sourceName ?? "—"}
                        </td>
                        <td className="py-2 text-gray-500 text-xs max-w-[400px] truncate">
                          {c.matchText ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">
              No chemicals indexed in this snapshot.
              {!snap.isComplete && " Sources were unreachable — no CAS extraction was possible."}
            </p>
          </CardBody>
        </Card>
      )}

      <div>
        <Link
          to="/products"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to Products
        </Link>
      </div>
    </div>
  );
}
