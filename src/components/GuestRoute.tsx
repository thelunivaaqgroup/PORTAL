import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function GuestRoute() {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
