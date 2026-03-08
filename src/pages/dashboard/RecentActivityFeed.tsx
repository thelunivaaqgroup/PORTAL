import type { AuditLogEntry } from "../../api/client";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700",
  UPDATE: "bg-rose-100 text-rose-700",
  DELETE: "bg-red-100 text-red-700",
  APPROVE: "bg-emerald-100 text-emerald-700",
  REJECT: "bg-red-100 text-red-700",
};

function getActionColor(action: string): string {
  // Try exact match first
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  // Try keyword match
  const upper = action.toUpperCase();
  if (upper.includes("CREATE") || upper.includes("SEED")) return "bg-green-100 text-green-700";
  if (upper.includes("UPDATE") || upper.includes("EDIT")) return "bg-rose-100 text-rose-700";
  if (upper.includes("DELETE") || upper.includes("REMOVE")) return "bg-red-100 text-red-700";
  if (upper.includes("LOGIN") || upper.includes("AUTH")) return "bg-purple-100 text-purple-700";
  if (upper.includes("VIEW")) return "bg-sky-100 text-sky-700";
  if (upper.includes("APPROVE")) return "bg-emerald-100 text-emerald-700";
  return "bg-gray-100 text-gray-600";
}

function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeEntity(entityType: string): string {
  return entityType
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type Props = { logs: AuditLogEntry[] };

export default function RecentActivityFeed({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No recent activity
      </p>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 py-3 px-1">
          <span
            className={`mt-0.5 inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase whitespace-nowrap ${getActionColor(log.action)}`}
          >
            {humanizeAction(log.action).length > 18
              ? humanizeAction(log.action).slice(0, 18) + "..."
              : humanizeAction(log.action)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 truncate">
              <span className="font-medium">
                {log.actor?.fullName ?? "System"}
              </span>
              {" "}
              <span className="text-gray-500">
                {humanizeEntity(log.entityType)}
              </span>
            </p>
            <p className="text-xs text-gray-400">{formatRelative(log.at)}</p>
          </div>
        </div>
      ))}
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
