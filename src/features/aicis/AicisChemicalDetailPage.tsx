import { useParams, Link } from "react-router-dom";
import { useAicisChemical } from "./hooks/useAicisApi";
import PageHeader from "../../components/PageHeader";
import { Card, CardBody } from "../../components/Card";
import { SkeletonLine } from "../../components/Skeleton";
import PageError from "../../components/PageError";

export default function AicisChemicalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useAicisChemical(id);

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

  if (error || !data?.chemical) {
    return <PageError message="Chemical record not found." />;
  }

  const c = data.chemical;

  const rows: [string, string | null][] = [
    ["CR No.", c.crNo],
    ["CAS No.", c.casNo],
    ["Approved Name", c.approvedName],
    ["Chemical Name", c.chemicalName],
    ["Molecular Formula", c.molecularFormula],
    ["Specific Information Requirements", c.specificInfoRequirements],
    ["Defined Scope", c.definedScope],
    ["Conditions of Use", c.conditionsOfUse],
    ["Prescribed Information", c.prescribedInfo],
  ];

  if (c.additionalJson?.casNumbers && c.additionalJson.casNumbers.length > 1) {
    rows.push(["Additional CAS Numbers", c.additionalJson.casNumbers.join(", ")]);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={c.approvedName}
        subtitle={`AICIS Inventory Chemical — CR No. ${c.crNo}`}
      />

      <Card>
        <CardBody className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Chemical Details</h3>
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
            {rows.map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium text-gray-500">{label}</dt>
                <dd className="text-sm text-gray-900">{value || "—"}</dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-1">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Source of Truth</h3>
          <dl className="grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-6">
            <div>
              <dt className="text-xs font-medium text-gray-500">Snapshot</dt>
              <dd className="text-sm text-gray-900">{c.snapshot.versionName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Region</dt>
              <dd className="text-sm text-gray-900">{c.snapshot.regionCode}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Source File</dt>
              <dd className="text-sm text-gray-900">{c.snapshot.sourceFileName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Effective Date</dt>
              <dd className="text-sm text-gray-900">
                {new Date(c.snapshot.asOfDate).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Imported At</dt>
              <dd className="text-sm text-gray-900">
                {new Date(c.snapshot.importedAt).toLocaleString()}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div>
        <Link
          to="/regulatory/aicis"
          className="text-sm text-blue-600 hover:underline"
        >
          Back to AICIS Inventory
        </Link>
      </div>
    </div>
  );
}
