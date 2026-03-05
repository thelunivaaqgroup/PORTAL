import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  message?: string;
  action?: ReactNode;
};

export default function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {message && <p className="text-sm text-gray-500">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
