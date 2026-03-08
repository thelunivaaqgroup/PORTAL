import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
};

export default function PageHeader({ title, subtitle, action, icon: Icon, iconColor }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={cn("mt-1 flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50", iconColor)}>
            <Icon className="h-5 w-5 text-rose-600" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
