import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../cn";
import { useNavGroups } from "./useNavItems";
import { useNavBadges } from "./useNavBadges";

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { pathname } = useLocation();
  const groups = useNavGroups();
  const badges = useNavBadges();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-gray-200 bg-slate-50 transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center border-b border-gray-200 px-3">
        {!collapsed && (
          <span className="text-lg font-bold text-slate-900 tracking-tight truncate">
            Portal
          </span>
        )}
        <button
          onClick={onToggle}
          className={cn(
            "inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors",
            collapsed ? "mx-auto" : "ml-auto",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group) => (
          <div key={group.groupLabel} className="mb-4">
            {/* Group label */}
            {!collapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.groupLabel}
              </p>
            )}
            {collapsed && <div className="mb-1 mx-2 border-t border-slate-200" />}

            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.path || pathname.startsWith(item.path + "/");
                const disabled = item.disabled;
                const badgeCount = item.badgeKey
                  ? badges[item.badgeKey as keyof typeof badges]
                  : 0;

                if (disabled) {
                  return (
                    <div
                      key={item.label}
                      className={cn(
                        "flex items-center rounded-md px-3 py-2 text-sm font-medium cursor-not-allowed",
                        "text-red-400",
                        collapsed && "justify-center px-0",
                      )}
                      title={collapsed ? `${item.label} (not required)` : undefined}
                    >
                      <Icon className="h-4.5 w-4.5 shrink-0" />
                      {!collapsed && (
                        <span className="ml-3 truncate">{item.label}</span>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.label}
                    to={item.path}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-rose-50 text-rose-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      collapsed && "justify-center px-0",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        "h-4.5 w-4.5 shrink-0",
                        active ? "text-rose-600" : "text-slate-400",
                      )}
                    />
                    {!collapsed && (
                      <>
                        <span className="ml-3 truncate">{item.label}</span>
                        {badgeCount > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        )}
                      </>
                    )}
                    {collapsed && badgeCount > 0 && (
                      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
