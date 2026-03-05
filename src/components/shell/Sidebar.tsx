import { Link, useLocation } from "react-router-dom";
import { cn } from "../cn";
import { useNavItems } from "./useNavItems";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { pathname } = useLocation();
  const items = useNavItems();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-gray-200 bg-white transition-all duration-200",
        collapsed ? "w-16" : "w-56",
      )}
    >
      <div className="flex h-14 items-center border-b border-gray-200 px-3">
        {!collapsed && (
          <span className="text-lg font-bold text-gray-900 truncate">
            Portal
          </span>
        )}
        <button
          onClick={onToggle}
          className={cn(
            "inline-flex items-center justify-center rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900",
            collapsed ? "mx-auto" : "ml-auto",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? "\u25B6" : "\u25C0"}
        </button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {items.map((item) => {
          const active = pathname === item.path;
          return (
            <Link
              key={item.label}
              to={item.path}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900",
                collapsed && "justify-center px-0",
              )}
              title={collapsed ? item.label : undefined}
            >
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded bg-gray-100 text-xs font-semibold",
                  active && "bg-blue-100 text-blue-700",
                )}
              >
                {item.abbrev}
              </span>
              {!collapsed && <span className="ml-3 truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
