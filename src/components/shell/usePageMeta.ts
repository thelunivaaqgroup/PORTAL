import { useLocation } from "react-router-dom";

const titleMap: Record<string, string> = {
  "/login": "Login",
  "/register": "Register",
  "/dashboard": "Dashboard",
  "/demo": "Demo Items",
  "/users": "Users",
  "/formulations": "Formulations",
  "/products": "Products",
  "/inventory": "Inventory",
  "/settings": "Settings",
};

/** Route prefix patterns → display titles */
const prefixTitles: [string, string][] = [
  ["/formulations/", "Formulation"],
  ["/products/range/", "Product Range"],
  ["/products/", "Product"],
  ["/banned-restricted/", "Banned / Restricted"],
  ["/inventory/", "Inventory"],
];

export function usePageTitle(): string {
  const { pathname } = useLocation();
  // Check exact match first
  if (titleMap[pathname]) return titleMap[pathname];
  // Check prefix patterns (order matters — more specific first)
  for (const [prefix, title] of prefixTitles) {
    if (pathname.startsWith(prefix)) return title;
  }
  return "Portal";
}

export function useBreadcrumbs(): { label: string; path: string }[] {
  const { pathname } = useLocation();

  if (pathname === "/dashboard") return [{ label: "Dashboard", path: "/dashboard" }];

  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { label: string; path: string }[] = [
    { label: "Dashboard", path: "/dashboard" },
  ];

  let accumulated = "";
  for (const segment of segments) {
    accumulated += `/${segment}`;
    const label = titleMap[accumulated] ?? segment.charAt(0).toUpperCase() + segment.slice(1);
    crumbs.push({ label, path: accumulated });
  }

  return crumbs;
}
