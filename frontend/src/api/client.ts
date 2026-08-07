// Strip any trailing slash — a stray one in the env var (e.g. "https://host.app/")
// would otherwise produce double-slash URLs like "https://host.app//auth/login"
// that don't match any backend route.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

// Auth uses a bearer token stored here rather than relying on the session
// cookie: the frontend (Vercel) and backend (Railway) live on different
// domains, and Safari/iOS blocks cross-site cookies outright (ITP), even
// with SameSite=None; Secure set correctly. A token in localStorage sent as
// an Authorization header sidesteps that entirely.
const TOKEN_KEY = 'fcb_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path: string, options: RequestInit = {}) {
  const isFormData = options.body instanceof FormData;
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    const message = (data && (data as any).error) || `Request failed (${res.status})`;
    throw new ApiError(message, res.status, data);
  }
  return data;
}

export const api = {
  get: (path: string) => request(path),
  post: (path: string, body?: unknown) =>
    request(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch: (path: string, body?: unknown) => request(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: (path: string) => request(path, { method: 'DELETE' }),
};
