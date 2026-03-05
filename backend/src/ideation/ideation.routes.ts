import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  getLatestIdeation,
  listIdeationVersions,
  saveIdeationVersion,
  activateIdeationVersion,
} from "./ideation.service.js";
import type { SaveIdeationBody } from "./ideation.types.js";

export const ideationRouter = Router();

ideationRouter.use(requireAuth);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/ideation/latest
// ──────────────────────────────────────────────────────────────
ideationRouter.get(
  "/:productId/ideation/latest",
  async (req, res) => {
    const ideation = await getLatestIdeation(req.params.productId as string);
    res.json({ ideation: ideation ?? null });
  },
);

// ──────────────────────────────────────────────────────────────
// GET /products/:productId/ideation
// ──────────────────────────────────────────────────────────────
ideationRouter.get(
  "/:productId/ideation",
  async (req, res) => {
    const versions = await listIdeationVersions(req.params.productId as string);
    res.json({ versions });
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/ideation
// ──────────────────────────────────────────────────────────────
ideationRouter.post(
  "/:productId/ideation",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const body = req.body as SaveIdeationBody;

    try {
      const ideation = await saveIdeationVersion(
        req.params.productId as string,
        body,
        req.auth!.userId,
        req.requestId,
      );
      res.status(201).json({ ideation });
    } catch (err) {
      const code = err instanceof Error ? err.message : "INTERNAL";
      const statusMap: Record<string, number> = {
        PRODUCT_NOT_FOUND: 404,
        INVALID_URL: 400,
        INVALID_COMPETITOR_LINK: 400,
      };
      const status = statusMap[code] ?? 500;
      res.status(status).json({ code, message: humanMessage(code) });
    }
  },
);

// ──────────────────────────────────────────────────────────────
// POST /products/:productId/ideation/:ideationId/activate
// ──────────────────────────────────────────────────────────────
ideationRouter.post(
  "/:productId/ideation/:ideationId/activate",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    try {
      const ideation = await activateIdeationVersion(
        req.params.productId as string,
        req.params.ideationId as string,
        req.auth!.userId,
        req.requestId,
      );
      res.json({ ideation });
    } catch (err) {
      const code = err instanceof Error ? err.message : "INTERNAL";
      const statusMap: Record<string, number> = {
        IDEATION_NOT_FOUND: 404,
      };
      const status = statusMap[code] ?? 500;
      res.status(status).json({ code, message: humanMessage(code) });
    }
  },
);

// ── Human-readable error messages ──

function humanMessage(code: string): string {
  const map: Record<string, string> = {
    PRODUCT_NOT_FOUND: "Product not found",
    IDEATION_NOT_FOUND: "Ideation version not found for this product",
    INVALID_URL: "Competitor link URL must start with http:// or https://",
    INVALID_COMPETITOR_LINK: "Each competitor link must have a label and url",
  };
  return map[code] ?? code;
}
