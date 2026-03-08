import { Link } from "react-router-dom";
import { Plus, ShieldCheck, Bell, Package } from "lucide-react";

const actions = [
  { label: "New Product", icon: Plus, path: "/products", color: "bg-rose-600 hover:bg-rose-700" },
  { label: "Compliance Hub", icon: ShieldCheck, path: "/compliance", color: "bg-emerald-600 hover:bg-emerald-700" },
  { label: "View Alerts", icon: Bell, path: "/alerts", color: "bg-amber-600 hover:bg-amber-700" },
  { label: "Inventory", icon: Package, path: "/inventory/lots", color: "bg-purple-600 hover:bg-purple-700" },
];

export default function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {actions.map((a) => (
        <Link
          key={a.label}
          to={a.path}
          className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition-colors ${a.color}`}
        >
          <a.icon className="h-4 w-4" />
          {a.label}
        </Link>
      ))}
    </div>
  );
}
