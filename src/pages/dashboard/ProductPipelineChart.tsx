import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Product } from "../../features/products/types";
import { STAGE_LABELS, type ProductStage } from "../../features/products/types";

const STAGE_ORDER: ProductStage[] = [
  "IDEA",
  "R_AND_D",
  "COMPLIANCE_READY",
  "PACKAGING_READY",
  "MANUFACTURING_APPROVED",
  "BATCH_CREATED",
  "BATCH_RELEASED",
  "READY_FOR_SALE",
  "LIVE",
  "DISCONTINUED",
];

const STAGE_COLORS: Record<string, string> = {
  IDEA: "#93c5fd",
  R_AND_D: "#60a5fa",
  COMPLIANCE_READY: "#3b82f6",
  PACKAGING_READY: "#2563eb",
  MANUFACTURING_APPROVED: "#1d4ed8",
  BATCH_CREATED: "#7c3aed",
  BATCH_RELEASED: "#a78bfa",
  READY_FOR_SALE: "#10b981",
  LIVE: "#059669",
  DISCONTINUED: "#9ca3af",
};

type Props = { products: Product[] };

export default function ProductPipelineChart({ products }: Props) {
  const data = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of products) {
      counts[p.stage] = (counts[p.stage] || 0) + 1;
    }
    return STAGE_ORDER.filter((s) => counts[s]).map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: counts[stage] || 0,
    }));
  }, [products]);

  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        No products yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={{ stroke: "#e2e8f0" }}
          interval={0}
          angle={-25}
          textAnchor="end"
          height={60}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            fontSize: 13,
          }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((entry) => (
            <Cell
              key={entry.stage}
              fill={STAGE_COLORS[entry.stage] || "#3b82f6"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
