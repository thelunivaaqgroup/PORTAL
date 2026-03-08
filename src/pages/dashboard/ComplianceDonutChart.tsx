import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { ComplianceRequest } from "../../features/compliance/types";

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  DRAFT: { color: "#94a3b8", label: "Draft" },
  IN_REVIEW: { color: "#f59e0b", label: "In Review" },
  APPROVED: { color: "#10b981", label: "Approved" },
  REJECTED: { color: "#ef4444", label: "Rejected" },
};

type Props = { requests: ComplianceRequest[] };

export default function ComplianceDonutChart({ requests }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of requests) {
      counts[r.status] = (counts[r.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, value]) => ({
      name: STATUS_CONFIG[status]?.label ?? status,
      value,
      color: STATUS_CONFIG[status]?.color ?? "#64748b",
    }));
  }, [requests]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No compliance requests
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={3}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            fontSize: 13,
          }}
        />
        <Legend
          verticalAlign="bottom"
          iconType="circle"
          iconSize={8}
          formatter={(value) => (
            <span style={{ color: "#475569", fontSize: 12 }}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
