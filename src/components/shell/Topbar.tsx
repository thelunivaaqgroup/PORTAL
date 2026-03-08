import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, Bell, LogOut, Clock } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import { usePageTitle } from "./usePageMeta";
import { useNavBadges } from "./useNavBadges";

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({ onMenuClick }: TopbarProps) {
  const title = usePageTitle();
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const badges = useNavBadges();

  function handleLogout() {
    logout();
    toast("info", "You have been signed out");
  }

  // Live clock
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const initials = user?.fullName
    ? user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* Live timestamp */}
        <div className="hidden items-center gap-1.5 text-xs text-gray-400 md:flex">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono tabular-nums">{timeStr}</span>
          <span className="text-gray-300">|</span>
          <span>{tzName}</span>
        </div>

        {/* Alert bell */}
        <Link
          to="/alerts"
          className="relative rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="System Alerts"
        >
          <Bell className="h-5 w-5" />
          {badges.activeAlerts > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center rounded-full bg-red-500 px-1 py-0.5 text-[10px] font-bold leading-none text-white min-w-[18px]">
              {badges.activeAlerts > 99 ? "99+" : badges.activeAlerts}
            </span>
          )}
        </Link>

        {/* User avatar + name */}
        {user && (
          <div className="hidden items-center gap-2 sm:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-100 text-xs font-semibold text-rose-700">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700 max-w-[180px] truncate">
              {user.fullName || user.email}
            </span>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          title="Sign out"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>
    </header>
  );
}
