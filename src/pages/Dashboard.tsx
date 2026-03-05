import { useAuth } from "../context/useAuth";
import { useMeQuery } from "../api/hooks/useMe";
import { Card, CardHeader, CardBody } from "../components/Card";
import Badge from "../components/Badge";
import { SkeletonCard } from "../components/Skeleton";
import PageError from "../components/PageError";

export default function Dashboard() {
  const { isAuthenticated } = useAuth();
  const { data: me, isLoading, isError, error, refetch } = useMeQuery(isAuthenticated);

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <SkeletonCard lines={4} />
      </div>
    );
  }

  if (isError) {
    return (
      <PageError
        title="Could not load dashboard"
        message={error instanceof Error ? error.message : "An unexpected error occurred."}
        details={error instanceof Error ? error.stack : undefined}
        onRetry={() => { refetch(); }}
      />
    );
  }

  const displayName = me?.fullName || me?.email || "User";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Welcome back, {displayName}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Account</p>
            <p className="mt-1 text-lg font-semibold text-gray-900">
              {me?.email ?? "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Active sessions</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">1</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-sm text-gray-500">Uptime</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">—</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">
              Recent activity
            </h2>
            <Badge variant="neutral">Placeholder</Badge>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500">
            Activity feed will appear here once the backend is connected.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
