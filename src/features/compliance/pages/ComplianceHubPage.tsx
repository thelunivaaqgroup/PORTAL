import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck, FileCheck, FileX, FileClock, FileEdit } from "lucide-react";
import PageHeader from "../../../components/PageHeader";
import StatCard from "../../../components/StatCard";
import { Card, CardBody } from "../../../components/Card";
import Badge from "../../../components/Badge";
import Button from "../../../components/Button";
import { useComplianceRequestsList } from "../hooks/useComplianceListApi";
import { SkeletonLine } from "../../../components/Skeleton";
import PageError from "../../../components/PageError";
import type { ComplianceRequestStatus, EligibilityStatus } from "../types";

const STATUS_LABELS: Record<ComplianceRequestStatus, string> = {
  DRAFT: "Draft",
  IN_REVIEW: "In review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const ELIGIBILITY_LABELS: Record<EligibilityStatus, string> = {
  NOT_ELIGIBLE: "Not eligible",
  ELIGIBLE: "Eligible",
  ELIGIBLE_WITH_WARNINGS: "Eligible (warnings)",
  READY_FOR_APPROVAL: "Ready for approval",
  APPROVED: "Approved",
};

export default function ComplianceHubPage() {
  const [statusFilter, setStatusFilter] = useState<ComplianceRequestStatus | "">("");
  const { data, isLoading, isError, error, refetch } = useComplianceRequestsList({
    status: statusFilter || undefined,
    limit: 100,
  });
  const requests = data?.requests ?? [];

  if (isError) {
    return (
      <PageError
        title="Failed to load compliance requests"
        message={error instanceof Error ? error.message : "An error occurred"}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Hub"
        subtitle="Regulatory and compliance requests — open a product to run checks or approve"
        icon={ShieldCheck}
      />

      {!isLoading && requests.length > 0 && (() => {
        const draft = requests.filter(r => r.status === "DRAFT").length;
        const inReview = requests.filter(r => r.status === "IN_REVIEW").length;
        const approved = requests.filter(r => r.status === "APPROVED").length;
        const rejected = requests.filter(r => r.status === "REJECTED").length;
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatCard label="Total" value={requests.length} icon={ShieldCheck} iconColor="text-rose-600" bgColor="bg-rose-50" />
            <StatCard label="Draft" value={draft} icon={FileEdit} iconColor="text-gray-500" bgColor="bg-gray-50" />
            <StatCard label="In Review" value={inReview} icon={FileClock} iconColor="text-amber-600" bgColor="bg-amber-50" />
            <StatCard label="Approved" value={approved} icon={FileCheck} iconColor="text-emerald-600" bgColor="bg-emerald-50" />
            <StatCard label="Rejected" value={rejected} icon={FileX} iconColor="text-red-600" bgColor="bg-red-50" />
          </div>
        );
      })()}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm font-medium text-gray-700">Filter by status:</span>
            {(["", "DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"] as const).map((s) => (
              <Button
                key={s || "all"}
                size="sm"
                variant={statusFilter === s ? "primary" : "secondary"}
                onClick={() => setStatusFilter(s)}
              >
                {s ? STATUS_LABELS[s] : "All"}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonLine key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Product</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">SKU</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Status</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Eligibility</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Created</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-gray-500">
                        No compliance requests found.
                      </td>
                    </tr>
                  ) : (
                    requests.map((req) => (
                      <tr key={req.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 px-2 font-medium text-gray-900">
                          {req.product?.name ?? "—"}
                        </td>
                        <td className="py-2 px-2 text-gray-600">{req.product?.skuCode ?? "—"}</td>
                        <td className="py-2 px-2">
                          <Badge variant={req.status === "APPROVED" ? "success" : req.status === "REJECTED" ? "error" : "neutral"}>
                            {STATUS_LABELS[req.status]}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-gray-600">
                          {req.eligibilityStatus
                            ? ELIGIBILITY_LABELS[req.eligibilityStatus]
                            : "—"}
                        </td>
                        <td className="py-2 px-2 text-gray-500">
                          {new Date(req.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-2 px-2">
                          <Link
                            to={`/products/${req.productId}`}
                            className="text-blue-600 hover:underline text-sm"
                          >
                            Open product →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
