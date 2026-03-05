import { useAuth } from "../../context/useAuth";
import { useToast } from "../../context/useToast";
import Button from "../Button";
import { usePageTitle } from "./usePageMeta";

type TopbarProps = {
  onMenuClick: () => void;
};

export default function Topbar({ onMenuClick }: TopbarProps) {
  const title = usePageTitle();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  function handleLogout() {
    logout();
    toast("info", "You have been signed out");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-4">
      <div className="flex items-center gap-3">
        {/* Mobile menu button */}
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
          aria-label="Open menu"
        >
          ☰
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <span className="hidden text-sm text-gray-500 sm:block">
            {user.fullName || user.email}
          </span>
        )}
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          Logout
        </Button>
      </div>
    </header>
  );
}
