import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { writeAuditLog } from "../audit/audit.service.js";
import { logger } from "../logger.js";
import {
  listIngredients,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from "./ingredients.service.js";
import {
  getUnmatchedRows,
  searchIngredients,
  resolveIngredient,
  uploadEvidenceDoc,
  getTradeNameAliases,
  upsertTradeNameAlias,
  autoResolveIngredients,
} from "./resolveIngredients.service.js";
import type { IngredientType } from "@prisma/client";

const upload = multer({ dest: "uploads/evidence/" });

export const ingredientsRouter = Router();

ingredientsRouter.use(requireAuth);

// ── GET /ingredients ──
ingredientsRouter.get("/", async (_req, res) => {
  const ingredients = await listIngredients();
  res.json({ ingredients });
});

// ── POST /ingredients ──
ingredientsRouter.post(
  "/",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { inciName, casNumber, synonyms } = req.body ?? {};

    if (!inciName || typeof inciName !== "string" || !inciName.trim()) {
      res.status(400).json({ code: "INVALID_BODY", message: "inciName is required" });
      return;
    }
    if (casNumber !== undefined && casNumber !== null && typeof casNumber !== "string") {
      res.status(400).json({ code: "INVALID_BODY", message: "casNumber must be a string or null" });
      return;
    }
    if (synonyms !== undefined && !Array.isArray(synonyms)) {
      res.status(400).json({ code: "INVALID_BODY", message: "synonyms must be an array of strings" });
      return;
    }

    try {
      const ingredient = await createIngredient(req.auth!.userId, {
        inciName,
        casNumber,
        synonyms,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "INGREDIENT_CREATED",
        entityType: "ingredient_master",
        entityId: ingredient.id,
        requestId: req.requestId,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { ingredientId: ingredient.id, inciName: ingredient.inciName },
      });

      res.status(201).json({ ingredient });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Create failed";
      if (message.includes("Unique constraint")) {
        res.status(409).json({ code: "DUPLICATE", message: "An ingredient with this INCI name already exists" });
        return;
      }
      res.status(422).json({ code: "CREATE_FAILED", message });
    }
  },
);

// ── PATCH /ingredients/:id ──
ingredientsRouter.patch(
  "/:id",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { id } = req.params;
    const { inciName, casNumber, synonyms } = req.body ?? {};

    if (inciName !== undefined && (typeof inciName !== "string" || !inciName.trim())) {
      res.status(400).json({ code: "INVALID_BODY", message: "inciName must be a non-empty string" });
      return;
    }
    if (casNumber !== undefined && casNumber !== null && typeof casNumber !== "string") {
      res.status(400).json({ code: "INVALID_BODY", message: "casNumber must be a string or null" });
      return;
    }
    if (synonyms !== undefined && !Array.isArray(synonyms)) {
      res.status(400).json({ code: "INVALID_BODY", message: "synonyms must be an array of strings" });
      return;
    }

    try {
      const ingredient = await updateIngredient(req.auth!.userId, id as string, {
        inciName,
        casNumber,
        synonyms,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "INGREDIENT_UPDATED",
        entityType: "ingredient_master",
        entityId: ingredient.id,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: { ingredientId: ingredient.id, inciName: ingredient.inciName },
      });

      res.json({ ingredient });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      if (message === "NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Ingredient not found" });
        return;
      }
      if (message.includes("Unique constraint")) {
        res.status(409).json({ code: "DUPLICATE", message: "An ingredient with this INCI name already exists" });
        return;
      }
      res.status(422).json({ code: "UPDATE_FAILED", message });
    }
  },
);

// ── DELETE /ingredients/:id ──
ingredientsRouter.delete(
  "/:id",
  requireRole("SUPER_ADMIN"),
  async (req, res) => {
    const { id } = req.params;

    try {
      await deleteIngredient(id as string);

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "INGREDIENT_DELETED",
        entityType: "ingredient_master",
        entityId: id as string,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: { ingredientId: id },
      });

      res.status(204).end();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      if (message === "NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Ingredient not found" });
        return;
      }
      res.status(422).json({ code: "DELETE_FAILED", message });
    }
  },
);

// ══════════════════════════════════════════════════════════════
// Ingredient Resolution endpoints
// ══════════════════════════════════════════════════════════════

// ── GET /ingredients/unmatched?requestId=... ──
ingredientsRouter.get(
  "/unmatched",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const requestId = req.query.requestId as string | undefined;
    if (!requestId) {
      res.status(400).json({ code: "VALIDATION", message: "requestId query parameter is required" });
      return;
    }
    try {
      const rows = await getUnmatchedRows(requestId);
      res.json({ rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "REQUEST_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Compliance request not found" });
        return;
      }
      throw err;
    }
  },
);

// ── GET /ingredients/search?q=...&limit=8 ──
ingredientsRouter.get(
  "/search",
  async (req, res) => {
    const q = (req.query.q as string || "").trim();
    const limit = Math.min(Number(req.query.limit) || 8, 50);
    if (q.length < 2) {
      res.json({ results: [] });
      return;
    }
    const results = await searchIngredients(q, limit);
    logger.info({ event: "ingredient_search", query: q, limit, resultCount: results.length });
    res.json({ results });
  },
);

// ── POST /ingredients/resolve ──
ingredientsRouter.post(
  "/resolve",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const {
      requestId, uploadRowId, ingredientMasterId, createPayload,
      addSynonym, ingredientType, casNumber, evidenceDocIds,
    } = req.body ?? {};

    if (!requestId || !uploadRowId || !ingredientType) {
      res.status(400).json({
        code: "VALIDATION",
        message: "requestId, uploadRowId, and ingredientType are required",
      });
      return;
    }

    const validTypes: IngredientType[] = ["STANDARD", "BOTANICAL", "BLEND", "POLYMER", "TRADE_NAME"];
    if (!validTypes.includes(ingredientType)) {
      res.status(400).json({
        code: "VALIDATION",
        message: `ingredientType must be one of: ${validTypes.join(", ")}`,
      });
      return;
    }

    if (!ingredientMasterId && !createPayload) {
      res.status(400).json({
        code: "VALIDATION",
        message: "Either ingredientMasterId or createPayload is required",
      });
      return;
    }

    try {
      const result = await resolveIngredient(req.auth!.userId, {
        requestId,
        uploadRowId,
        ingredientMasterId,
        createPayload,
        addSynonym: addSynonym !== false,
        ingredientType,
        casNumber,
        evidenceDocIds,
      });

      await writeAuditLog({
        actorUserId: req.auth!.userId,
        action: "INGREDIENT_RESOLVED",
        entityType: "formulation_upload_row",
        entityId: uploadRowId,
        requestId: req.requestId,
        ip: (Array.isArray(req.ip) ? req.ip[0] : req.ip) ?? undefined,
        userAgent: Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"][0] : req.headers["user-agent"],
        metadata: {
          requestId,
          matchedIngredientId: result.matchedIngredientId,
          matchedInciName: result.matchedInciName,
          ingredientType,
          synonymAdded: result.synonymAdded,
        },
      });

      res.json({ result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const errorMap: Record<string, { status: number; code: string; message: string }> = {
        REQUEST_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Compliance request not found" },
        ALREADY_APPROVED: { status: 400, code: "ALREADY_APPROVED", message: "Cannot resolve — request already approved" },
        ROW_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Upload row not found" },
        ROW_NOT_IN_REQUEST: { status: 400, code: "VALIDATION", message: "Row does not belong to this request's upload" },
        INGREDIENT_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "Ingredient master not found" },
        INCI_NAME_REQUIRED: { status: 400, code: "VALIDATION", message: "inciName is required in createPayload" },
      };
      const mapped = errorMap[msg];
      if (mapped) {
        res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
        return;
      }
      if (msg.includes("Unique constraint")) {
        res.status(409).json({ code: "DUPLICATE", message: "An ingredient with this INCI name already exists" });
        return;
      }
      throw err;
    }
  },
);

// ── POST /ingredients/evidence-upload ──
ingredientsRouter.post(
  "/evidence-upload",
  requireRole("SUPER_ADMIN", "ADMIN"),
  upload.single("file"),
  async (req, res) => {
    const { uploadRowId, docType } = req.body ?? {};
    const file = req.file;

    if (!uploadRowId || !file) {
      res.status(400).json({ code: "VALIDATION", message: "uploadRowId and file are required" });
      return;
    }

    try {
      const doc = await uploadEvidenceDoc(
        req.auth!.userId,
        uploadRowId,
        file,
        docType || "OTHER",
      );
      res.status(201).json({ doc });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "ROW_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Upload row not found" });
        return;
      }
      throw err;
    }
  },
);

// ── POST /ingredients/auto-resolve ──
ingredientsRouter.post(
  "/auto-resolve",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { productId, requestId, limit } = req.body ?? {};

    if (!productId || !requestId) {
      res.status(400).json({
        code: "VALIDATION",
        message: "productId and requestId are required",
      });
      return;
    }

    try {
      const result = await autoResolveIngredients(
        req.auth!.userId,
        productId as string,
        requestId as string,
        typeof limit === "number" ? Math.min(limit, 200) : 100,
      );
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "REQUEST_NOT_FOUND") {
        res.status(404).json({ code: "NOT_FOUND", message: "Compliance request not found" });
        return;
      }
      throw err;
    }
  },
);

// ── GET /ingredients/trade-aliases ──
ingredientsRouter.get(
  "/trade-aliases",
  async (_req, res) => {
    const aliases = await getTradeNameAliases();
    res.json({ aliases });
  },
);

// ── POST /ingredients/trade-aliases ──
ingredientsRouter.post(
  "/trade-aliases",
  requireRole("SUPER_ADMIN", "ADMIN"),
  async (req, res) => {
    const { tradeName, canonicalInci, casNumber } = req.body ?? {};
    if (!tradeName || !canonicalInci) {
      res.status(400).json({ code: "VALIDATION", message: "tradeName and canonicalInci are required" });
      return;
    }
    const alias = await upsertTradeNameAlias(tradeName, canonicalInci, casNumber);
    res.json({ alias });
  },
);
