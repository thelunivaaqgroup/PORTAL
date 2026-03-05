import type { ReactNode } from "react";
import { cn } from "./cn";

type AlertVariant = "info" | "error";

type AlertProps = {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
};

const variantStyles: Record<AlertVariant, string> = {
  info: "border-blue-200 bg-blue-50 text-blue-800",
  error: "border-red-200 bg-red-50 text-red-800",
};

export default function Alert({
  variant = "info",
  children,
  className,
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
