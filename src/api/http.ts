import { env } from "./env";
import { ApiError } from "./errors";
import { tokenStore } from "./tokenStore";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
};

function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, env.API_BASE_URL);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof TypeError && err.message === "Failed to fetch") {
    return new ApiError({
      message: "Network error — unable to reach the server.",
      code: "NETWORK_ERROR",
    });
  }
  if (err instanceof DOMException && err.name === "AbortError") {
    return new ApiError({
      message: "Request was cancelled.",
      code: "ABORTED",
    });
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return new ApiError({ message });
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, params, headers = {}, signal } = options;

  const merged: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  const token = tokenStore.getAccessToken();
  if (token) {
    merged["Authorization"] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers: merged,
    signal,
  };

  if (body !== undefined) {
    config.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), config);
  } catch (err) {
    throw normalizeError(err);
  }

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      /* ignore parse failure */
    }

    const serverMessage =
      errorBody &&
      typeof errorBody === "object" &&
      "message" in errorBody &&
      typeof (errorBody as Record<string, unknown>).message === "string"
        ? (errorBody as Record<string, string>).message
        : response.statusText;

    throw new ApiError({
      message: serverMessage,
      status: response.status,
      code:
        errorBody &&
        typeof errorBody === "object" &&
        "code" in errorBody &&
        typeof (errorBody as Record<string, unknown>).code === "string"
          ? (errorBody as Record<string, string>).code
          : undefined,
      details: errorBody,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

/**
 * Send a multipart/form-data request (for file uploads).
 * Does NOT set Content-Type — the browser sets the boundary automatically.
 */
export async function requestMultipart<T>(
  path: string,
  formData: FormData,
  options: { method?: "POST" | "PUT" | "PATCH"; signal?: AbortSignal } = {},
): Promise<T> {
  const { method = "POST", signal } = options;

  const headers: Record<string, string> = {};
  const token = tokenStore.getAccessToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers,
      body: formData,
      signal,
    });
  } catch (err) {
    throw normalizeError(err);
  }

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = await response.json();
    } catch {
      /* ignore */
    }

    const serverMessage =
      errorBody &&
      typeof errorBody === "object" &&
      "message" in errorBody &&
      typeof (errorBody as Record<string, unknown>).message === "string"
        ? (errorBody as Record<string, string>).message
        : response.statusText;

    throw new ApiError({
      message: serverMessage,
      status: response.status,
      code:
        errorBody &&
        typeof errorBody === "object" &&
        "code" in errorBody &&
        typeof (errorBody as Record<string, unknown>).code === "string"
          ? (errorBody as Record<string, string>).code
          : undefined,
      details: errorBody,
    });
  }

  return (await response.json()) as T;
}
