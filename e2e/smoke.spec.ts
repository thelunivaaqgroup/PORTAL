import { test, expect } from "@playwright/test";

// Seeded SUPER_ADMIN credentials (adjust domain for real backend)
const SA_EMAIL = process.env.SA_EMAIL ?? "superadmin@thelunivaaqgroup.com";
const SA_PASS = process.env.SA_PASS ?? "Password@123";

// 1) Public routes
test("root redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});

test("login page loads", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("h1")).toContainText("Sign in");
});

// 2) Protected redirect
test("dashboard redirects to login when unauthenticated", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

// 3) Login with unknown email shows error
test("login with unprovisioned email shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("Password@123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Account not provisioned");
});

// 4) Login with wrong password shows error
test("login with wrong password shows error", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SA_EMAIL);
  await page.getByLabel("Password").fill("wrongpassword");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid credentials");
});

// 5) SUPER_ADMIN login -> dashboard
test("super admin can login and reach dashboard", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SA_EMAIL);
  await page.getByLabel("Password").fill(SA_PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

// 6) SUPER_ADMIN can access demo + open New Item modal
test("super admin can open New Item modal on demo page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SA_EMAIL);
  await page.getByLabel("Password").fill(SA_PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Demo" }).click();
  await expect(page).toHaveURL(/\/demo/);

  await page.getByRole("button", { name: "New Item" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal).toBeVisible();
  await expect(modal.getByText("New Item")).toBeVisible();
});

// 7) /register redirects to /login
test("register redirects to login", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/login/);
});

// 8) SUPER_ADMIN can access users page
test("super admin can access users page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SA_EMAIL);
  await page.getByLabel("Password").fill(SA_PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL(/\/users/);
  await expect(page.getByText("Manage user accounts and role assignments.")).toBeVisible();
});

// 9) Formulations E2E smoke (requires backend running)
test("formulations: full workflow", async ({ page }) => {
  // Login
  await page.goto("/login");
  await page.getByLabel("Email").fill(SA_EMAIL);
  await page.getByLabel("Password").fill(SA_PASS);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Navigate to formulations
  await page.getByRole("link", { name: "Formulations" }).click();
  await expect(page).toHaveURL(/\/formulations/);
  await expect(page.getByText("Manage product formulations")).toBeVisible();

  // Create SKU
  await page.getByRole("button", { name: "New SKU" }).click();
  const skuModal = page.getByRole("dialog");
  await expect(skuModal).toBeVisible();
  const ts = Date.now();
  await skuModal.getByLabel("SKU Code").fill(`E2E-${ts}`);
  await skuModal.getByLabel("Product Name").fill(`E2E Product ${ts}`);
  await skuModal.getByRole("button", { name: "Create" }).click();
  await expect(skuModal).not.toBeVisible();

  // Create formulation
  await page.getByRole("button", { name: "New Formulation" }).click();
  const formModal = page.getByRole("dialog");
  await expect(formModal).toBeVisible();
  await formModal.getByRole("button", { name: "Create" }).click();
  // Should navigate to detail page
  await expect(page).toHaveURL(/\/formulations\/.+/);

  // Add ingredient
  await page.getByRole("button", { name: "Add Ingredient" }).click();
  const ingModal = page.getByRole("dialog");
  await ingModal.getByLabel("Ingredient Name").fill("Water");
  await ingModal.getByLabel("Function").fill("Solvent");
  await ingModal.getByLabel("Concentration %").fill("50");
  await ingModal.getByRole("button", { name: "Add" }).click();
  await expect(ingModal).not.toBeVisible();

  // Add document
  await page.getByRole("button", { name: "Add Document" }).click();
  const docModal = page.getByRole("dialog");
  await docModal.getByLabel("File Name").fill("test.pdf");
  await docModal.getByLabel("URL").fill("https://example.com/test.pdf");
  await docModal.getByRole("button", { name: "Add" }).click();
  await expect(docModal).not.toBeVisible();

  // Submit for review
  await page.getByRole("button", { name: "Submit for Review" }).click();
  await expect(page.getByText("IN REVIEW")).toBeVisible();

  // Approve
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("APPROVED")).toBeVisible();

  // Create v2
  await page.getByRole("button", { name: "New Version" }).click();
  await expect(page.getByText("v2")).toBeVisible();
});
