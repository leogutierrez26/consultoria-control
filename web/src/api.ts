// Cliente HTTP para la API. En dev usa el proxy /api; en producción usa VITE_API_URL.
const BASE = (import.meta as any).env?.VITE_API_URL || '/api';

export interface ApiError extends Error {
  status: number;
  details?: any;
}

async function http<T = any>(
  method: string,
  path: string,
  token?: string | null,
  body?: any
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* vacío */
  }

  if (!res.ok) {
    const err: ApiError = new Error(data?.error || 'Error de red') as ApiError;
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data as T;
}

export const api = {
  get: <T = any>(path: string, token?: string | null) => http<T>('GET', path, token),
  post: <T = any>(path: string, body?: any, token?: string | null) => http<T>('POST', path, token, body),
  patch: <T = any>(path: string, body?: any, token?: string | null) => http<T>('PATCH', path, token, body),
  put: <T = any>(path: string, body?: any, token?: string | null) => http<T>('PUT', path, token, body)
};

export function tokenStore() {
  const KEY = 'cc_token';
  return {
    get: () => localStorage.getItem(KEY),
    set: (t: string) => localStorage.setItem(KEY, t),
    clear: () => localStorage.removeItem(KEY)
  };
}
