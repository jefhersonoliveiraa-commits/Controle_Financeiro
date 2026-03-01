const ACCESS_TOKEN_KEY = "financeiro.accessToken";
const REFRESH_TOKEN_KEY = "financeiro.refreshToken";
let memoryAccessToken: string | null = null;
let memoryRefreshToken: string | null = null;

export function getAccessToken(): string | null {
  if (memoryAccessToken) return memoryAccessToken;
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  memoryAccessToken = token;
  return token;
}

export function getRefreshToken(): string | null {
  if (memoryRefreshToken) return memoryRefreshToken;
  if (typeof window === "undefined") return null;
  const token = window.sessionStorage.getItem(REFRESH_TOKEN_KEY);
  memoryRefreshToken = token;
  return token;
}

export function setTokens(accessToken: string, refreshToken: string): void {
  memoryAccessToken = accessToken;
  memoryRefreshToken = refreshToken;
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  window.sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
  memoryAccessToken = null;
  memoryRefreshToken = null;
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
