import express from "express";
import pinoHttp from "pino-http";
import { logger } from "./logger.js";
import { requestIdMiddleware } from "./middleware/requestId.js";
import { authRouter } from "./auth/auth.routes.js";
import { usersRouter } from "./users/users.routes.js";
import { skusRouter } from "./skus/skus.routes.js";
import { ingredientsRouter } from "./ingredients/ingredients.routes.js";
import { productsRouter } from "./products/products.routes.js";
import { labelsRouter } from "./labels/labels.routes.js";
import { documentsRouter } from "./documents/documents.routes.js";
import { inventoryRouter } from "./inventory/inventory.routes.js";
import { manufacturingRouter } from "./manufacturing/manufacturing.routes.js";
import { alertsRouter } from "./alerts/alerts.routes.js";
import { finishedGoodsRouter } from "./finishedGoods/finishedGoods.routes.js";
import { ideationRouter } from "./ideation/ideation.routes.js";
import { rangesRouter } from "./ranges/ranges.routes.js";
import { greenfieldRouter } from "./greenfield/greenfield.routes.js";
import { aicisRouter } from "./aicis/aicis.routes.js";
import { bannedRestrictedRouter } from "./bannedRestricted/bannedRestricted.routes.js";
import { restrictedRouter } from "./restricted/restricted.routes.js";
import { complianceRequestsRouter } from "./complianceRequests/complianceRequests.routes.js";
import { auditRouter } from "./audit/audit.routes.js";

export const app = express();

// CORS allowlist
const ALLOWED_ORIGINS = ["http://localhost:5173", "http://localhost:5174", "http://localhost:5176", "http://localhost:5177", "http://localhost:5178", "http://localhost:5179"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Request-Id");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// Body parsing
app.use(express.json());

// Request ID
app.use(requestIdMiddleware);

// HTTP logging
app.use(pinoHttp({ logger, autoLogging: true }));

// Routes
app.use("/auth", authRouter);
app.use("/users", usersRouter);
app.use("/skus", skusRouter);
app.use("/ingredients", ingredientsRouter);
app.use("/products", productsRouter);
app.use("/products", labelsRouter);
app.use("/products", documentsRouter);
app.use("/inventory", inventoryRouter);
app.use("/products", manufacturingRouter);
app.use("/alerts", alertsRouter);
app.use("/products", finishedGoodsRouter);
app.use("/products", ideationRouter);
app.use("/ranges", rangesRouter);
app.use("/greenfield", greenfieldRouter);
app.use("/aicis", aicisRouter);
app.use("/banned-restricted", bannedRestrictedRouter);
app.use("/restricted", restrictedRouter);
app.use("/", auditRouter);
app.use("/", complianceRequestsRouter);

// Legacy formulation routes — 410 GONE
const goneHandler: express.RequestHandler = (_req, res) => {
  res.status(410).json({
    code: "GONE",
    message: "This endpoint has been removed. Use /products/:productId/formulations/upload instead.",
  });
};
app.use("/formulations", goneHandler);
app.use("/versions", goneHandler);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "Unhandled error");
  res.status(500).json({ code: "INTERNAL", message: "Internal server error" });
});
