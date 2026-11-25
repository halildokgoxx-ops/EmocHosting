import { auth } from './firebase';

const API_BASE = import.meta.env.VITE_API_URL || '';

export async function apiRequest(path, { method = 'GET', body, isFormData = false } = {}) {
  const headers = {};
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `Hata (${res.status})`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  if (!res.ok) {
    throw new Error(`Sunucu hatası (${res.status})`);
  }
  return res;
}

/**
 * Fetches a protected binary/blob response using Authorization Bearer header
 * instead of leaking ID tokens in URL query strings.
 */
export async function fetchAuthenticatedBlob(path) {
  const headers = {};
  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken();
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, { method: 'GET', headers });
  if (!res.ok) {
    let msg = `İndirme hatası (${res.status})`;
    try {
      const json = await res.json();
      if (json?.error) msg = json.error;
    } catch {}
    throw new Error(msg);
  }
  return res.blob();
}

export async function downloadAuthenticatedFile(path, fallbackFilename = 'download') {
  const blob = await fetchAuthenticatedBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Validates external URLs for safe rendering in <a href> / <img src>.
 */
export function safeExternalUrl(url, { allowRelativeAssets = false } = {}) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (allowRelativeAssets && /^\/assets\/[a-zA-Z0-9._-]+$/.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return parsed.toString();
  } catch {}
  return '';
}
