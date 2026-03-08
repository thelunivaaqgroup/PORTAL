import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

type StatCardProps = {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  iconColor?: string;
  bgColor?: string;
};

export default function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-gray-500",
  bgColor = "bg-gray-50",
}: StatCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
      {Icon && (
        <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", bgColor)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
      )}
      <div>
        <p className="text-xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
