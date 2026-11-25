function normalizePath(raw, fallback) {
  let p = String(raw || fallback).trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+$/, '');
  if (!p || p.toLowerCase() === '/admin' || p.toLowerCase() === '/api/admin') {
    return fallback;
  }
  return p;
}

export const ADMIN_ROUTE_PATH = normalizePath(
  import.meta.env.VITE_ADMIN_PATH,
  '/komuta-x9k4'
);

export const ADMIN_API_PREFIX = normalizePath(
  import.meta.env.VITE_ADMIN_API_PATH,
  '/api/komuta-x9k4'
);
