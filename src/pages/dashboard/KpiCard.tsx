import type { LucideIcon } from "lucide-react";
import { cn } from "../../components/cn";

type KpiCardProps = {
  label: string;
  value: number | string;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  subtitle?: string;
};

export default function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-rose-600",
  bgColor = "bg-rose-50",
  subtitle,
}: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            {value}
          </p>
          {subtitle && (
            <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg",
            bgColor,
          )}
        >
          <Icon className={cn("h-5 w-5", iconColor)} />
        </div>
      </div>
    </div>
  );
}
