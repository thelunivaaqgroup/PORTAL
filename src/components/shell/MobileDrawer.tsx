import { Link, useLocation } from "react-router-dom";
import { X } from "lucide-react";
import { cn } from "../cn";
import { useNavGroups } from "./useNavItems";
import { useNavBadges } from "./useNavBadges";

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
};

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const { pathname } = useLocation();
  const groups = useNavGroups();
  const badges = useNavBadges();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <aside className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-50 shadow-lg">
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-lg font-bold text-slate-900 tracking-tight">
            Portal
          </span>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.map((group) => (
            <div key={group.groupLabel} className="mb-4">
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {group.groupLabel}
              </p>

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
                        className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-red-400 cursor-not-allowed"
                      >
                        <Icon className="h-4.5 w-4.5 shrink-0" />
                        <span className="ml-3 truncate">{item.label}</span>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={item.label}
                      to={item.path}
                      onClick={onClose}
                      className={cn(
                        "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-rose-50 text-rose-700"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4.5 w-4.5 shrink-0",
                          active ? "text-rose-600" : "text-slate-400",
                        )}
                      />
                      <span className="ml-3 truncate">{item.label}</span>
                      {badgeCount > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                          {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
    </div>
  );
}
