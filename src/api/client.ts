import { env } from "./env";
import { request, requestMultipart } from "./http";
import { tokenStore } from "./tokenStore";
import { getPermissionsForRole } from "../config/permissions";
import type { Role } from "../config/permissions";
import type {
  LoginPayload,
  LoginApiResponse,
  MeApiResponse,
  User,
} from "./auth.types";
import type {
  FormulationUpload,
  FormulationUploadRow,
  ProductSku,
} from "../features/products/types";
import type {
  Ingredient,
  CreateIngredientPayload,
  UpdateIngredientPayload,
} from "../features/ingredients/types";
import type {
  Product,
  CreateProductPayload,
  UpdateProductPayload,
  LabelMetadata,
  SaveLabelPayload,
  LabelValidationResult,
  RegionCode,
  ProductDocument,
} from "../features/products/types";
import type {
  RawMaterialLot,
  CreateLotPayload,
  UpdateLotPayload,
  BulkUploadResult,
} from "../features/inventory/types";
import type { Batch, MaxProducibleResult } from "../features/manufacturing/types";
import type { SystemAlert, AlertStatus, AlertType } from "../features/alerts/types";
import type {
  FinishedGoodLot,
  FinishedGoodsSummary,
  PackSpecPayload,
} from "../features/finishedGoods/types";
import type {
  IdeationVersion,
  SaveIdeationPayload,
} from "../features/ideation/types";
import type { ProductRange } from "../features/products/types";
import type {
  GreenfieldIdea,
  CreateGreenfieldPayload,
  UpdateGreenfieldPayload,
  ConvertGreenfieldPayload,
} from "../features/greenfield/types";
import type {
  AicisScrutinySnapshot,
  AicisRunResult,
  AicisActiveResponse,
  AicisImportResult,
  AicisChemical,
  BannedRestrictedSnapshotSummary,
  BannedRestrictedUploadEvaluation,
  BannedRestrictedChemicalInfo,
  BannedRestrictedSyncResult,
  BannedRestrictedIngestResult,
} from "../features/aicis/types";
import type {
  ComplianceRequest,
  EligibilityResult,
  ApprovalResult,
  GeneratedArtifact,
  UnmatchedRow,
  IngredientSearchResult,
  ResolvePayload,
  ResolveResult,
  AutoResolveResult,
} from "../features/compliance/types";
import type { UserApiRow, CreateUserPayload } from "../features/users/types";

export type AuditLogEntry = {
  id: string;
  at: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
  metadata: Record<string, unknown>;
  actor: { id: string; email: string; fullName: string } | null;
};

/* -------------------------------------------------- */
/*  Helpers                                            */
/* -------------------------------------------------- */

function toFrontendUser(u: { email: string; fullName?: string; role: string }): User {
  const role = u.role as Role;
  return {
    fullName: u.fullName ?? "",
    email: u.email,
    role,
    permissions: getPermissionsForRole(role),
  };
}

/* -------------------------------------------------- */
/*  Mock adapters                                      */
/* -------------------------------------------------- */

const mockUser: User = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  role: "ADMIN",
  permissions: ["dashboard:read", "demo:read", "demo:create", "demo:delete"],
};

const mockDelay = () => new Promise<void>((r) => setTimeout(r, 300));

const mockAuth = {
  async login(_payload: LoginPayload): Promise<User> {
    await mockDelay();
    tokenStore.setAccessToken("mock-token");
    return mockUser;
  },
  async me(): Promise<User> {
    await mockDelay();
    return mockUser;
  },
};

/* -------------------------------------------------- */
/*  Real adapters (call HTTP endpoints)                */
/* -------------------------------------------------- */

const realAuth = {
  async login(payload: LoginPayload): Promise<User> {
    const res = await request<LoginApiResponse>("/auth/login", {
      method: "POST",
      body: payload,
    });
    tokenStore.setAccessToken(res.accessToken);
    tokenStore.setRefreshToken(res.refreshToken);
    return toFrontendUser(res.user);
  },
  async me(): Promise<User> {
    const res = await request<MeApiResponse>("/auth/me");
    return toFrontendUser(res.user);
  },
};

/* -------------------------------------------------- */
/*  E2 Core adapters (SKUs, Formulations, Versions)    */
/* -------------------------------------------------- */

const realSkus = {
  async list() {
    return request<{ skus: ProductSku[] }>("/skus");
  },
  async create(body: { skuCode: string; productName: string }) {
    return request<{ sku: ProductSku }>("/skus", { method: "POST", body });
  },
};


/* -------------------------------------------------- */
/*  Ingredient Master adapters                         */
/* -------------------------------------------------- */

const realIngredients = {
  async list() {
    return request<{ ingredients: Ingredient[] }>("/ingredients");
  },
  async create(body: CreateIngredientPayload) {
    return request<{ ingredient: Ingredient }>("/ingredients", { method: "POST", body });
  },
  async update(id: string, body: UpdateIngredientPayload) {
    return request<{ ingredient: Ingredient }>(`/ingredients/${id}`, { method: "PATCH", body });
  },
  async delete(id: string) {
    return request<void>(`/ingredients/${id}`, { method: "DELETE" });
  },
  async getUnmatched(requestId: string) {
    return request<{ rows: UnmatchedRow[] }>(`/ingredients/unmatched?requestId=${requestId}`);
  },
  async search(q: string, limit = 8) {
    return request<{ results: IngredientSearchResult[] }>(`/ingredients/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  },
  async resolve(payload: ResolvePayload) {
    return request<{ result: ResolveResult }>("/ingredients/resolve", { method: "POST", body: payload });
  },
  async uploadEvidence(uploadRowId: string, file: File, docType: string) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("uploadRowId", uploadRowId);
    fd.append("docType", docType);
    return requestMultipart<{ doc: { id: string; fileName: string; docType: string } }>(
      "/ingredients/evidence-upload",
      fd,
    );
  },
  async autoResolve(productId: string, requestId: string, limit?: number) {
    return request<AutoResolveResult>("/ingredients/auto-resolve", {
      method: "POST",
      body: { productId, requestId, limit },
    });
  },
};

/* -------------------------------------------------- */
/*  Product adapters                                   */
/* -------------------------------------------------- */

const realProducts = {
  async list() {
    return request<{ products: Product[] }>("/products");
  },
  async listByRange(rangeId: string) {
    return request<{ products: Product[] }>(`/products?rangeId=${rangeId}`);
  },
  async getById(id: string) {
    return request<{ product: Product }>(`/products/${id}`);
  },
  async create(body: CreateProductPayload) {
    return request<{ product: Product }>("/products", { method: "POST", body });
  },
  async update(id: string, body: UpdateProductPayload) {
    return request<{ product: Product }>(`/products/${id}`, { method: "PATCH", body });
  },
  async delete(id: string) {
    return request<{ ok: boolean }>(`/products/${id}`, { method: "DELETE" });
  },
  async uploadFormulation(productId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return requestMultipart<{
      productId: string;
      formulationId: string;
      uploadId: string;
      hasDatasheetUpload: boolean;
      stage: string;
      extractedRowCount: number;
      extractionMode: string;
      reasonCode: string;
    }>(`/products/${productId}/formulations/upload`, fd);
  },
  async replaceFormulation(productId: string, file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return requestMultipart<{
      productId: string;
      formulationId: string;
      uploadId: string;
      hasDatasheetUpload: boolean;
      stage: string;
      extractedRowCount: number;
      extractionMode: string;
      reasonCode: string;
      previousVersion: number;
      newVersion: number;
      archivedUploadId: string | null;
    }>(`/products/${productId}/formulation/replace`, fd);
  },
  async getFormulationHistory(productId: string) {
    return request<{
      active: FormulationUpload | null;
      archived: {
        id: string;
        fileName: string;
        version: number;
        createdAt: string;
        archivedAt: string | null;
        archivedBy: { id: string; fullName: string } | null;
        createdBy: { id: string; fullName: string } | null;
        _count: { rows: number };
      }[];
    }>(`/products/${productId}/formulation/history`);
  },
  async listUploads(productId: string) {
    return request<{ uploads: FormulationUpload[] }>(`/products/${productId}/uploads`);
  },
  async getUploadById(productId: string, uploadId: string) {
    return request<{ upload: FormulationUpload }>(`/products/${productId}/uploads/${uploadId}`);
  },
  async matchRow(productId: string, rowId: string, ingredientId: string) {
    return request<{ row: FormulationUploadRow }>(`/products/${productId}/uploads/rows/${rowId}/match`, {
      method: "PATCH",
      body: { ingredientId },
    });
  },
};

/* -------------------------------------------------- */
/*  Labels adapters                                    */
/* -------------------------------------------------- */

const realLabels = {
  async list(productId: string, region: RegionCode) {
    return request<{ labels: LabelMetadata[]; activeId: string | null }>(
      `/products/${productId}/labels?region=${region}`,
    );
  },
  async save(productId: string, body: SaveLabelPayload) {
    return request<{ label: LabelMetadata }>(`/products/${productId}/labels`, {
      method: "POST",
      body,
    });
  },
  async activate(productId: string, labelId: string) {
    return request<{ label: LabelMetadata }>(
      `/products/${productId}/labels/${labelId}/activate`,
      { method: "POST" },
    );
  },
  async validate(productId: string, region: RegionCode) {
    return request<LabelValidationResult>(
      `/products/${productId}/labels/validate?region=${region}`,
    );
  },
};

/* -------------------------------------------------- */
/*  Product Documents adapters                         */
/* -------------------------------------------------- */

const realDocuments = {
  async list(productId: string) {
    return request<{ documents: ProductDocument[] }>(
      `/products/${productId}/documents`,
    );
  },
  async upload(productId: string, formData: FormData) {
    return requestMultipart<{ document: ProductDocument }>(
      `/products/${productId}/documents`,
      formData,
    );
  },
  downloadUrl(productId: string, docId: string) {
    return `${env.API_BASE_URL}/products/${productId}/documents/${docId}/download`;
  },
};

/* -------------------------------------------------- */
/*  Inventory adapters                                 */
/* -------------------------------------------------- */

const realInventory = {
  async listLots() {
    return request<{ lots: RawMaterialLot[] }>("/inventory/lots");
  },
  async createLot(body: CreateLotPayload) {
    return request<{ lot: RawMaterialLot }>("/inventory/lots", { method: "POST", body });
  },
  async updateLot(id: string, body: UpdateLotPayload) {
    return request<{ lot: RawMaterialLot }>(`/inventory/lots/${id}`, { method: "PATCH", body });
  },
  async deleteLot(id: string) {
    return request<void>(`/inventory/lots/${id}`, { method: "DELETE" });
  },
  async bulkUpload(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    return requestMultipart<BulkUploadResult>("/inventory/lots/bulk", fd);
  },
};

/* -------------------------------------------------- */
/*  Manufacturing adapters                             */
/* -------------------------------------------------- */

const realManufacturing = {
  async approveManufacturing(productId: string) {
    return request<{ product: Product }>(`/products/${productId}/manufacturing/approve`, { method: "POST" });
  },
  async getMaxProducible(productId: string) {
    return request<MaxProducibleResult>(`/products/${productId}/batches/max-producible`);
  },
  async createBatch(productId: string, productionQuantityKg: number) {
    return request<{ batch: Batch }>(`/products/${productId}/batches`, {
      method: "POST",
      body: { productionQuantityKg },
    });
  },
  async listBatches(productId: string) {
    return request<{ batches: Batch[] }>(`/products/${productId}/batches`);
  },
  async releaseBatch(productId: string, batchId: string) {
    return request<{ batch: Batch }>(`/products/${productId}/batches/${batchId}/release`, { method: "POST" });
  },
};

/* -------------------------------------------------- */
/*  Alerts adapters                                    */
/* -------------------------------------------------- */

const realAlerts = {
  async list(params?: { status?: AlertStatus; type?: AlertType }) {
    const qp = new URLSearchParams();
    if (params?.status) qp.set("status", params.status);
    if (params?.type) qp.set("type", params.type);
    const qs = qp.toString();
    return request<{ alerts: SystemAlert[] }>(`/alerts${qs ? `?${qs}` : ""}`);
  },
  async run() {
    return request<{ ok: boolean }>("/alerts/run", { method: "POST" });
  },
  async resolve(id: string) {
    return request<{ alert: SystemAlert }>(`/alerts/${id}/resolve`, { method: "POST" });
  },
};

/* -------------------------------------------------- */
/*  Finished Goods adapters                            */
/* -------------------------------------------------- */

const realFinishedGoods = {
  async setPackSpec(productId: string, body: PackSpecPayload) {
    return request<{ productId: string; packNetContentMl: number; fillDensityGPerMl: number }>(
      `/products/${productId}/pack-spec`,
      { method: "PATCH", body },
    );
  },
  async listLots(productId: string) {
    return request<{ lots: FinishedGoodLot[] }>(
      `/products/${productId}/finished-goods`,
    );
  },
  async summary(productId: string) {
    return request<FinishedGoodsSummary>(
      `/products/${productId}/finished-goods/summary`,
    );
  },
  async createFromBatch(productId: string, batchId: string) {
    return request<FinishedGoodLot>(
      `/products/${productId}/batches/${batchId}/finished-goods`,
      { method: "POST" },
    );
  },
};

/* -------------------------------------------------- */
/*  Ideation adapters                                  */
/* -------------------------------------------------- */

const realIdeation = {
  async latest(productId: string) {
    return request<{ ideation: IdeationVersion | null }>(
      `/products/${productId}/ideation/latest`,
    );
  },
  async list(productId: string) {
    return request<{ versions: IdeationVersion[] }>(
      `/products/${productId}/ideation`,
    );
  },
  async save(productId: string, body: SaveIdeationPayload) {
    return request<{ ideation: IdeationVersion }>(
      `/products/${productId}/ideation`,
      { method: "POST", body },
    );
  },
  async activate(productId: string, ideationId: string) {
    return request<{ ideation: IdeationVersion }>(
      `/products/${productId}/ideation/${ideationId}/activate`,
      { method: "POST" },
    );
  },
};

/* -------------------------------------------------- */
/*  Ranges (Folders) adapters                          */
/* -------------------------------------------------- */

const realRanges = {
  async list() {
    return request<{ ranges: ProductRange[] }>("/ranges");
  },
  async create(name: string) {
    return request<{ range: ProductRange }>("/ranges", {
      method: "POST",
      body: { name },
    });
  },
  async update(id: string, name: string) {
    return request<{ range: ProductRange }>(`/ranges/${id}`, {
      method: "PATCH",
      body: { name },
    });
  },
  async delete(id: string) {
    return request<{ ok: boolean }>(`/ranges/${id}`, { method: "DELETE" });
  },
};

/* -------------------------------------------------- */
/*  Greenfield (Independent Ideation) adapters         */
/* -------------------------------------------------- */

const realGreenfield = {
  async list() {
    return request<{ ideas: GreenfieldIdea[] }>("/greenfield");
  },
  async getById(id: string) {
    return request<{ idea: GreenfieldIdea }>(`/greenfield/${id}`);
  },
  async create(body: CreateGreenfieldPayload) {
    return request<{ idea: GreenfieldIdea }>("/greenfield", { method: "POST", body });
  },
  async update(id: string, body: UpdateGreenfieldPayload) {
    return request<{ idea: GreenfieldIdea }>(`/greenfield/${id}`, { method: "PATCH", body });
  },
  async markReady(id: string) {
    return request<{ idea: GreenfieldIdea }>(`/greenfield/${id}/mark-ready`, { method: "POST" });
  },
  async convert(id: string, body: ConvertGreenfieldPayload) {
    return request<{ idea: GreenfieldIdea; product: Product }>(`/greenfield/${id}/convert`, { method: "POST", body });
  },
  async archive(id: string) {
    return request<{ idea: GreenfieldIdea }>(`/greenfield/${id}/archive`, { method: "POST" });
  },
};

/* -------------------------------------------------- */
/*  AICIS adapters                                     */
/* -------------------------------------------------- */

const realAicis = {
  async getActive(regionCode = "AU") {
    return request<AicisActiveResponse>(
      `/aicis/active?regionCode=${regionCode}`,
    );
  },
  async importSnapshot(formData: FormData) {
    return requestMultipart<{ snapshot: AicisImportResult }>(
      `/aicis/import`,
      formData,
    );
  },
  async runScrutiny(uploadId: string, region = "AU") {
    return request<{ scrutiny: AicisRunResult }>(
      `/aicis/uploads/${uploadId}/run?region=${region}`,
      { method: "POST" },
    );
  },
  async getLatestScrutiny(uploadId: string, region = "AU") {
    return request<{ scrutiny: AicisScrutinySnapshot }>(
      `/aicis/uploads/${uploadId}/latest?region=${region}`,
    );
  },
  async getChemical(chemicalId: string) {
    return request<{ chemical: AicisChemical }>(
      `/aicis/chemicals/${chemicalId}`,
    );
  },
};

/* -------------------------------------------------- */
/*  Banned / Restricted adapters                       */
/* -------------------------------------------------- */

const realBannedRestricted = {
  async sync() {
    return request<{ result: BannedRestrictedSyncResult }>(
      "/banned-restricted/sync",
      { method: "POST" },
    );
  },
  async importArtifacts(formData: FormData) {
    return requestMultipart<{ result: BannedRestrictedSyncResult }>(
      "/banned-restricted/import-artifacts",
      formData,
    );
  },
  async ingestOffline(formData: FormData) {
    return requestMultipart<{ result: BannedRestrictedIngestResult }>(
      "/banned-restricted/ingest-offline",
      formData,
    );
  },
  async getLatestSnapshot() {
    return request<{ snapshot: BannedRestrictedSnapshotSummary | null }>(
      "/banned-restricted/snapshots/latest",
    );
  },
  async getSnapshotById(id: string) {
    return request<{ snapshot: BannedRestrictedSnapshotSummary }>(
      `/banned-restricted/snapshots/${id}`,
    );
  },
  async evaluateUpload(uploadId: string) {
    return request<BannedRestrictedUploadEvaluation>(
      `/banned-restricted/uploads/${uploadId}/evaluate`,
    );
  },
  async chemicalsByCas(casNo: string) {
    return request<{ chemicals: BannedRestrictedChemicalInfo[]; count: number }>(
      `/banned-restricted/chemicals?casNo=${encodeURIComponent(casNo)}`,
    );
  },
  async getChemicalById(id: string) {
    return request<{ chemical: BannedRestrictedChemicalInfo }>(
      `/banned-restricted/chemicals/${id}`,
    );
  },
};

/* -------------------------------------------------- */
/*  Compliance Requests adapters                       */
/* -------------------------------------------------- */

const realComplianceRequests = {
  async createForProduct(productId: string, regionScope?: string[]) {
    return request<{ request: ComplianceRequest }>(
      `/products/${productId}/compliance-requests`,
      { method: "POST", body: { regionScope: regionScope ?? [] } },
    );
  },
  async getLatestForProduct(productId: string) {
    return request<{ request: ComplianceRequest }>(
      `/products/${productId}/compliance-requests/latest`,
    );
  },
  async list(params?: { status?: string; limit?: number }) {
    const qp = new URLSearchParams();
    if (params?.status) qp.set("status", params.status);
    if (params?.limit != null) qp.set("limit", String(params.limit));
    const qs = qp.toString();
    return request<{ requests: ComplianceRequest[] }>(
      `/compliance-requests${qs ? `?${qs}` : ""}`,
    );
  },
  async getById(id: string) {
    return request<{ request: ComplianceRequest }>(
      `/compliance-requests/${id}`,
    );
  },
  async checkEligibility(id: string) {
    return request<EligibilityResult>(
      `/compliance-requests/${id}/check-eligibility`,
      { method: "POST" },
    );
  },
  async approve(id: string, comment?: string) {
    return request<ApprovalResult>(
      `/compliance-requests/${id}/approve`,
      { method: "POST", body: { comment } },
    );
  },
  async getArtifacts(id: string) {
    return request<{ artifacts: GeneratedArtifact[] }>(
      `/compliance-requests/${id}/artifacts`,
    );
  },
  async getArtifact(requestId: string, artifactId: string) {
    return request<{ artifact: GeneratedArtifact }>(
      `/compliance-requests/${requestId}/artifacts/${artifactId}`,
    );
  },
};

/* -------------------------------------------------- */
/*  Restricted Chemical Index adapters                 */
/* -------------------------------------------------- */

export type RestrictedDatasetSummary = {
  id: string;
  name: string;
  versionLabel: string;
  effectiveDate: string | null;
  status: string;
  hashSha256: string | null;
  chemicalsCount: number;
  notes: string | null;
  createdAt: string;
};

const realRestricted = {
  async getActiveDataset() {
    return request<{ dataset: RestrictedDatasetSummary | null }>(
      "/restricted/active-dataset",
    );
  },
  async listDatasets() {
    return request<{ datasets: RestrictedDatasetSummary[] }>(
      "/restricted/datasets",
    );
  },
  async uploadEvidencePack(formData: FormData) {
    return requestMultipart<{ dataset: RestrictedDatasetSummary }>(
      "/restricted/evidence-pack/upload",
      formData,
    );
  },
  async checkCas(casNumbers: string[]) {
    return request<{
      sourceId: string;
      sourceName: string;
      sourceVersion: string;
      checkedAt: string;
      results: Array<{
        casNo: string;
        normalizedCasNo: string;
        chemicalName: string | null;
        status: string;
        reason: string | null;
      }>;
      notFound: string[];
    }>("/restricted/check", { method: "POST", body: { casNumbers } });
  },
  async archiveDataset(id: string) {
    return request<{ success: boolean }>(
      `/restricted/datasets/${id}/archive`,
      { method: "POST" },
    );
  },
};

/* -------------------------------------------------- */
/*  Users adapters                                     */
/* -------------------------------------------------- */

const realUsers = {
  async list() {
    return request<{ users: UserApiRow[] }>("/users");
  },
  async create(body: CreateUserPayload) {
    return request<{ user: UserApiRow }>("/users", { method: "POST", body });
  },
  async changeRole(id: string, role: string) {
    return request<{ user: UserApiRow }>(`/users/${id}/role`, { method: "PATCH", body: { role } });
  },
  async setActive(id: string, isActive: boolean) {
    return request<{ user: UserApiRow }>(`/users/${id}/deactivate`, { method: "PATCH", body: { isActive } });
  },
  async resetPassword(id: string, newPassword: string) {
    return request<{ message: string }>(`/users/${id}/reset-password`, { method: "POST", body: { newPassword } });
  },
};

/* -------------------------------------------------- */
/*  Audit log adapters                                 */
/* -------------------------------------------------- */

const realAudit = {
  async list(params?: {
    from?: string;
    to?: string;
    actorUserId?: string;
    entityType?: string;
    action?: string;
    limit?: number;
    cursor?: string;
  }) {
    const qp = new URLSearchParams();
    if (params?.from) qp.set("from", params.from);
    if (params?.to) qp.set("to", params.to);
    if (params?.actorUserId) qp.set("actorUserId", params.actorUserId);
    if (params?.entityType) qp.set("entityType", params.entityType);
    if (params?.action) qp.set("action", params.action);
    if (params?.limit != null) qp.set("limit", String(params.limit));
    if (params?.cursor) qp.set("cursor", params.cursor);
    const qs = qp.toString();
    return request<{
      logs: AuditLogEntry[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/audit-logs${qs ? `?${qs}` : ""}`);
  },
};

/* -------------------------------------------------- */
/*  Singleton API client                               */
/* -------------------------------------------------- */

const isMock = env.API_MODE === "mock";

export const api = {
  auth: isMock ? mockAuth : realAuth,
  skus: realSkus,
  ingredients: realIngredients,
  products: realProducts,
  labels: realLabels,
  documents: realDocuments,
  inventory: realInventory,
  manufacturing: realManufacturing,
  alerts: realAlerts,
  finishedGoods: realFinishedGoods,
  ideation: realIdeation,
  ranges: realRanges,
  greenfield: realGreenfield,
  aicis: realAicis,
  bannedRestricted: realBannedRestricted,
  restricted: realRestricted,
  complianceRequests: realComplianceRequests,
  users: realUsers,
  audit: realAudit,
} as const;
