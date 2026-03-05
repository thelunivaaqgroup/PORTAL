import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

export default function SmartRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
}
