import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import type { SystemAlert } from "../../features/alerts/types";
import { ALERT_TYPE_LABELS } from "../../features/alerts/types";

const TYPE_COLORS: Record<string, string> = {
  LOW_STOCK: "bg-amber-50 text-amber-700",
  LOT_EXPIRING_SOON: "bg-amber-50 text-amber-700",
  LOT_EXPIRED: "bg-red-50 text-red-700",
  DOC_EXPIRING_SOON: "bg-amber-50 text-amber-700",
  DOC_EXPIRED: "bg-red-50 text-red-700",
  COMPLIANCE_FAILURE: "bg-red-50 text-red-700",
  STAGE_DELAY: "bg-amber-50 text-amber-700",
};

type Props = { alerts: SystemAlert[] };

export default function ActiveAlertsTable({ alerts }: Props) {
  const top5 = alerts.slice(0, 5);

  if (top5.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertTriangle className="h-8 w-8 text-green-400 mb-2" />
        <p className="text-sm font-medium text-gray-600">All clear</p>
        <p className="text-xs text-gray-400">No active alerts</p>
      </div>
    );
  }

  return (
    <div>
      <div className="divide-y divide-gray-100">
        {top5.map((alert) => (
          <div key={alert.id} className="flex items-center gap-3 py-3 px-1">
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${
                TYPE_COLORS[alert.type] ?? "bg-gray-100 text-gray-700"
              }`}
            >
              {ALERT_TYPE_LABELS[alert.type]}
            </span>
            <span className="flex-1 text-sm text-gray-700 truncate">
              {alert.title}
            </span>
            <span className="text-xs text-gray-400 shrink-0">
              {formatRelative(alert.updatedAt)}
            </span>
          </div>
        ))}
      </div>
      {alerts.length > 5 && (
        <Link
          to="/alerts"
          className="mt-3 flex items-center gap-1 text-sm font-medium text-rose-600 hover:text-rose-700"
        >
          View all {alerts.length} alerts
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
