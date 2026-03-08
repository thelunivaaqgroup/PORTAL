import {
  Package,
  Bell,
  ShieldCheck,
  Warehouse,
} from "lucide-react";
import { useAuth } from "../context/useAuth";
import { useMeQuery } from "../api/hooks/useMe";
import { Card, CardHeader, CardBody } from "../components/Card";
import { SkeletonCard } from "../components/Skeleton";
import PageError from "../components/PageError";
import { useDashboardData } from "./dashboard/useDashboardData";
import KpiCard from "./dashboard/KpiCard";
import ProductPipelineChart from "./dashboard/ProductPipelineChart";
import ComplianceDonutChart from "./dashboard/ComplianceDonutChart";
import RegionalDistribution from "./dashboard/RegionalDistribution";
import ActiveAlertsTable from "./dashboard/ActiveAlertsTable";
import RecentActivityFeed from "./dashboard/RecentActivityFeed";
import InventoryHealth from "./dashboard/InventoryHealth";
import QuickActions from "./dashboard/QuickActions";

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  const { data: me } = useMeQuery(isAuthenticated);
  const dashboard = useDashboardData();

  if (dashboard.isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-24 animate-pulse rounded-xl bg-gradient-to-r from-rose-100 to-rose-50" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonCard lines={8} />
          <SkeletonCard lines={8} />
        </div>
      </div>
    );
  }

  if (dashboard.isError) {
    return (
      <PageError
        title="Could not load dashboard"
        message="One or more data sources failed to load."
        onRetry={dashboard.refetch}
      />
    );
  }

  const displayName = me?.fullName || me?.email || "User";
  const role = me?.role ?? "";
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const approvedCount = dashboard.complianceRequests.filter(
    (r) => r.status === "APPROVED",
  ).length;
  const complianceRate =
    dashboard.complianceRequests.length > 0
      ? Math.round((approvedCount / dashboard.complianceRequests.length) * 100)
      : 0;

  const availableLots = dashboard.lots.filter(
    (l) => l.status === "AVAILABLE",
  ).length;

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl bg-gradient-to-r from-rose-700 to-rose-900 px-6 py-5 text-white shadow-md">
        <h1 className="text-2xl font-bold tracking-tight">
          Welcome back, {displayName}
        </h1>
        <p className="mt-1 text-sm text-rose-200">
          {role && (
            <span className="mr-2 inline-flex items-center rounded-full bg-rose-600/40 px-2 py-0.5 text-xs font-medium text-rose-100">
              {role.replace("_", " ")}
            </span>
          )}
          {dateStr}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Products"
          value={dashboard.products.length}
          icon={Package}
          iconColor="text-rose-600"
          bgColor="bg-rose-50"
          subtitle={`${dashboard.products.filter((p) => p.stage === "LIVE").length} live`}
        />
        <KpiCard
          label="Active Alerts"
          value={dashboard.alerts.length}
          icon={Bell}
          iconColor={dashboard.alerts.length > 0 ? "text-red-600" : "text-green-600"}
          bgColor={dashboard.alerts.length > 0 ? "bg-red-50" : "bg-green-50"}
          subtitle={dashboard.alerts.length === 0 ? "All clear" : "Requires attention"}
        />
        <KpiCard
          label="Compliance Rate"
          value={`${complianceRate}%`}
          icon={ShieldCheck}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
          subtitle={`${approvedCount} of ${dashboard.complianceRequests.length} approved`}
        />
        <KpiCard
          label="Inventory Lots"
          value={dashboard.lots.length}
          icon={Warehouse}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          subtitle={`${availableLots} available`}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Product Pipeline
            </h2>
          </CardHeader>
          <CardBody>
            <ProductPipelineChart products={dashboard.products} />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Compliance Status
            </h2>
          </CardHeader>
          <CardBody>
            <ComplianceDonutChart requests={dashboard.complianceRequests} />
          </CardBody>
        </Card>
      </div>

      {/* Regional distribution + Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Regional Product Distribution
            </h2>
          </CardHeader>
          <CardBody>
            <RegionalDistribution products={dashboard.products} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Active Alerts
            </h2>
          </CardHeader>
          <CardBody>
            <ActiveAlertsTable alerts={dashboard.alerts} />
          </CardBody>
        </Card>
      </div>

      {/* Activity + Health */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Recent Activity
            </h2>
          </CardHeader>
          <CardBody>
            <RecentActivityFeed logs={dashboard.auditLogs} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Inventory Health
            </h2>
          </CardHeader>
          <CardBody>
            <InventoryHealth lots={dashboard.lots} />
          </CardBody>
        </Card>
      </div>

      <div>
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">
              Quick Actions
            </h2>
          </CardHeader>
          <CardBody>
            <QuickActions />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
