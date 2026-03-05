/**
 * Standard API error model.
 * All fetch errors are normalized into this shape.
 */
export class ApiError extends Error {
  status: number | undefined;
  code: string | undefined;
  details: unknown;

  constructor(opts: {
    message: string;
    status?: number;
    code?: string;
    details?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}
