import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "./token-store";

const API_URL_FROM_ENV = process.env.NEXT_PUBLIC_API_URL?.trim() ?? "";

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/** Returns the base URL for the NestJS backend API (non-auth routes). */
function resolveApiUrl() {
  const normalizedEnvUrl = API_URL_FROM_ENV.replace(/\/+$/, "");

  if (normalizedEnvUrl) {
    if (typeof window !== "undefined") {
      try {
        const parsed = new URL(normalizedEnvUrl);
        const browserHost = window.location.hostname;
        if (browserHost && !isLoopbackHost(browserHost) && isLoopbackHost(parsed.hostname)) {
          parsed.hostname = browserHost;
          return parsed.toString().replace(/\/+$/, "");
        }
      } catch {
        // Keep fallback to the raw env value when URL parsing fails.
      }
    }
    return normalizedEnvUrl;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:3333`;
  }

  return "http://localhost:3333";
}

/**
 * Returns the base URL for Next.js local API routes (auth).
 * In the browser, uses the current origin. On the server, falls back to localhost:3000.
 */
function resolveLocalApiUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "http://localhost:3000";
}

/** Auth paths are served by Next.js API routes, everything else by the NestJS backend. */
const AUTH_PATH_PREFIX = "/auth/";

function isAuthPath(path: string) {
  return path === "/auth/login" || path === "/auth/register" || path === "/auth/refresh" || path === "/auth/profile";
}

/** Resolves the full URL for a given API path. Auth routes go to Next.js, others to NestJS. */
function resolveFullUrl(path: string) {
  if (isAuthPath(path)) {
    return `${resolveLocalApiUrl()}/api${path}`;
  }
  return `${resolveApiUrl()}${path}`;
}

type RequestOptions = RequestInit & {
  skipAuthRetry?: boolean;
};

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  const response = await fetch(`${resolveLocalApiUrl()}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const data = (await response.json()) as { accessToken: string; refreshToken: string };
  setTokens(data.accessToken, data.refreshToken);
  return data.accessToken;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const accessToken = getAccessToken();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(resolveFullUrl(path), {
    ...options,
    headers
  });

  if (response.status === 401 && !options.skipAuthRetry) {
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return apiRequest<T>(path, {
      ...options,
      skipAuthRetry: true
    });
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(errorBody.message)
      ? errorBody.message.join(" | ")
      : errorBody.message ?? "Erro ao processar requisicao.";
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string, options: RequestOptions = {}): Promise<Blob> {
  const accessToken = getAccessToken();
  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(resolveFullUrl(path), {
    ...options,
    headers
  });

  if (response.status === 401 && !options.skipAuthRetry) {
    const newAccessToken = await refreshAccessToken();
    if (!newAccessToken) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return apiDownload(path, {
      ...options,
      skipAuthRetry: true
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Erro ao baixar arquivo.");
  }

  return response.blob();
}

export async function login(input: { email: string; password: string }) {
  return apiRequest<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string; role: "USER" | "ADMIN" };
  }>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRetry: true
  });
}

export async function register(input: { name: string; email: string; password: string }) {
  return apiRequest<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; name: string; email: string; role: "USER" | "ADMIN" };
  }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
    skipAuthRetry: true
  });
}
