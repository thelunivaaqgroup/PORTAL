import { createBrowserRouter, Navigate } from "react-router-dom";
import Layout from "../components/Layout";
import ShellLayout from "../components/shell/ShellLayout";
import ProtectedRoute from "../components/ProtectedRoute";
import GuestRoute from "../components/GuestRoute";
import SmartRedirect from "../components/SmartRedirect";
import RequirePermission from "../components/RequirePermission";
import Login from "../pages/Login";
import Dashboard from "../pages/Dashboard";
import ProductsListPage from "../features/products/pages/ProductsListPage";
import ProductDetailPage from "../features/products/pages/ProductDetailPage";
import ProductRangeDetailPage from "../features/products/pages/ProductRangeDetailPage";
import InventoryLotsPage from "../features/inventory/pages/InventoryLotsPage";
import GreenfieldPage from "../features/greenfield/pages/GreenfieldPage";
import UsersListPage from "../features/users/pages/UsersListPage";
import AicisInventoryPage from "../features/aicis/AicisInventoryPage";
import AicisChemicalDetailPage from "../features/aicis/AicisChemicalDetailPage";
import BannedRestrictedRecordPage from "../features/bannedRestricted/pages/BannedRestrictedRecordPage";
import AuditLogPage from "../features/audit/pages/AuditLogPage";
import ComplianceHubPage from "../features/compliance/pages/ComplianceHubPage";
import AlertsPage from "../features/alerts/pages/AlertsPage";
import NotFound from "../pages/NotFound";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <SmartRedirect /> },
      {
        element: <GuestRoute />,
        children: [
          { path: "/login", element: <Login /> },
          { path: "/register", element: <Navigate to="/login" replace /> },
        ],
      },
      { path: "*", element: <NotFound /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <ShellLayout />,
        children: [
          {
            path: "/dashboard",
            element: (
              <RequirePermission permission="dashboard:read">
                <Dashboard />
              </RequirePermission>
            ),
          },
          {
            path: "/alerts",
            element: (
              <RequirePermission permission="dashboard:read">
                <AlertsPage />
              </RequirePermission>
            ),
          },
          {
            path: "/greenfield",
            element: (
              <RequirePermission permission="greenfield:read">
                <GreenfieldPage />
              </RequirePermission>
            ),
          },
          {
            path: "/products",
            element: (
              <RequirePermission permission="products:read">
                <ProductsListPage />
              </RequirePermission>
            ),
          },
          {
            path: "/products/range/:rangeId",
            element: (
              <RequirePermission permission="products:read">
                <ProductRangeDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: "/products/:id",
            element: (
              <RequirePermission permission="products:read">
                <ProductDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: "/inventory/lots",
            element: (
              <RequirePermission permission="inventory:read">
                <InventoryLotsPage />
              </RequirePermission>
            ),
          },
          {
            path: "/compliance",
            element: (
              <RequirePermission permission="compliance:read">
                <ComplianceHubPage />
              </RequirePermission>
            ),
          },
          {
            path: "/regulatory/aicis",
            element: (
              <RequirePermission permission="aicis:read">
                <AicisInventoryPage />
              </RequirePermission>
            ),
          },
          {
            path: "/aicis-inventory/chemicals/:id",
            element: (
              <RequirePermission permission="aicis:read">
                <AicisChemicalDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: "/banned-restricted/records/:id",
            element: (
              <RequirePermission permission="aicis:read">
                <BannedRestrictedRecordPage />
              </RequirePermission>
            ),
          },
          {
            path: "/audit",
            element: (
              <RequirePermission permission="audit:read">
                <AuditLogPage />
              </RequirePermission>
            ),
          },
          {
            path: "/users",
            element: (
              <RequirePermission permission="users:read">
                <UsersListPage />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
]);
