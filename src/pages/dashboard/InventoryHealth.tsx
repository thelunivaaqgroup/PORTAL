import { AlertTriangle, Clock } from "lucide-react";
import type { RawMaterialLot } from "../../features/inventory/types";

type Props = { lots: RawMaterialLot[] };

export default function InventoryHealth({ lots }: Props) {
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  const lowStock = lots.filter(
    (l) => l.status === "AVAILABLE" && l.quantityRemainingKg < 1,
  );

  const expiringSoon = lots.filter((l) => {
    if (!l.expiryDate || l.status === "EXPIRED") return false;
    const exp = new Date(l.expiryDate).getTime();
    return exp > now && exp - now < thirtyDays;
  });

  const expired = lots.filter((l) => l.status === "EXPIRED");

  const issues = [
    ...lowStock.map((l) => ({
      id: l.id,
      type: "low" as const,
      text: `${l.ingredient.inciName} — ${l.quantityRemainingKg.toFixed(1)} kg remaining`,
    })),
    ...expiringSoon.map((l) => ({
      id: l.id,
      type: "expiring" as const,
      text: `${l.ingredient.inciName} — expires ${new Date(l.expiryDate!).toLocaleDateString()}`,
    })),
    ...expired.slice(0, 3).map((l) => ({
      id: l.id,
      type: "expired" as const,
      text: `${l.ingredient.inciName} — expired`,
    })),
  ].slice(0, 6);

  if (issues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 mb-2">
          <AlertTriangle className="h-5 w-5 text-green-500" />
        </div>
        <p className="text-sm font-medium text-gray-600">Inventory healthy</p>
        <p className="text-xs text-gray-400">No stock or expiry warnings</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-gray-100">
      {issues.map((issue) => (
        <div key={issue.id} className="flex items-center gap-2.5 py-2.5 px-1">
          {issue.type === "low" ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Clock className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className="text-sm text-gray-700 truncate">{issue.text}</span>
          <span
            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              issue.type === "low"
                ? "bg-amber-50 text-amber-600"
                : issue.type === "expiring"
                  ? "bg-orange-50 text-orange-600"
                  : "bg-red-50 text-red-600"
            }`}
          >
            {issue.type === "low"
              ? "Low Stock"
              : issue.type === "expiring"
                ? "Expiring"
                : "Expired"}
          </span>
        </div>
      ))}
    </div>
  );
}
