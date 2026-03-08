import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { Product } from "../../features/products/types";

const REGION_CONFIG: Record<string, { color: string; label: string }> = {
  AU: { color: "#e11d48", label: "Australia" },
  IN: { color: "#f97316", label: "India" },
  US: { color: "#8b5cf6", label: "United States" },
  UK: { color: "#06b6d4", label: "United Kingdom" },
  NZ: { color: "#10b981", label: "New Zealand" },
};

const FALLBACK_COLOR = "#94a3b8";

// Business context: 10,000 total units — AU gets 2,000, IN gets 8,000
const UNIT_ALLOCATION: Record<string, number> = {
  AU: 2000,
  IN: 8000,
};

type Props = { products: Product[] };

export default function RegionalDistribution({ products }: Props) {
  const data = useMemo(() => {
    const regionCounts: Record<string, number> = {};
    for (const p of products) {
      for (const region of p.targetRegions) {
        regionCounts[region] = (regionCounts[region] || 0) + 1;
      }
    }

    // If no products yet, show the planned allocation
    if (Object.keys(regionCounts).length === 0) {
      return Object.entries(UNIT_ALLOCATION).map(([region, units]) => ({
        name: REGION_CONFIG[region]?.label ?? region,
        value: units,
        color: REGION_CONFIG[region]?.color ?? FALLBACK_COLOR,
        region,
        suffix: "units",
      }));
    }

    return Object.entries(regionCounts).map(([region, count]) => ({
      name: REGION_CONFIG[region]?.label ?? region,
      value: count,
      color: REGION_CONFIG[region]?.color ?? FALLBACK_COLOR,
      region,
      suffix: "products",
    }));
  }, [products]);

  const hasProducts = products.length > 0;

  return (
    <div>
      {!hasProducts && (
        <p className="mb-3 text-xs text-gray-400 text-center">
          Planned unit allocation (10,000 total)
        </p>
      )}
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={85}
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
            formatter={(value: number, _name: string, props: { payload: { suffix: string } }) => [
              `${value.toLocaleString()} ${props.payload.suffix}`,
              props.payload.suffix === "units" ? "Allocation" : "Products",
            ]}
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

      {/* Allocation breakdown */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {data.map((entry) => (
          <div
            key={entry.region}
            className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2"
          >
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">
                {entry.name}
              </p>
              <p className="text-sm font-bold text-gray-900">
                {entry.value.toLocaleString()}{" "}
                <span className="text-xs font-normal text-gray-400">
                  {entry.suffix}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
