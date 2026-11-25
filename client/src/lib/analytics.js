const CONSENT_KEY = 'emoc_cookie_consent';
const PREFS_KEY = 'emoc_cookie_prefs';

function readCookiePrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        necessary: true,
        analytics: Boolean(parsed.analytics),
        updatedAt: Number(parsed.updatedAt || 0),
      };
    }
  } catch {}
  const legacy = localStorage.getItem(CONSENT_KEY);
  return {
    necessary: true,
    analytics: legacy === 'all',
    updatedAt: 0,
  };
}

export function getCookieConsentState() {
  const saved = localStorage.getItem(CONSENT_KEY);
  return {
    decided: Boolean(saved),
    level: saved || null,
    prefs: readCookiePrefs(),
  };
}

export function hasAnalyticsConsent() {
  if (typeof navigator !== 'undefined' && (navigator.doNotTrack === '1' || window.doNotTrack === '1')) {
    return false;
  }
  const { decided, prefs } = getCookieConsentState();
  return decided && prefs.analytics === true;
}

function sendBeaconJson(url, payloadObj) {
  const body = JSON.stringify(payloadObj);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

export function saveCookieConsent({ analytics = false } = {}) {
  const level = analytics ? 'all' : 'essential';
  const prefs = { necessary: true, analytics: Boolean(analytics), updatedAt: Date.now() };
  try {
    localStorage.setItem(CONSENT_KEY, level);
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    document.cookie = `emoc_cookie_consent=${level}; max-age=31536000; path=/; SameSite=Lax`;
  } catch {}

  sendBeaconJson('/api/public/analytics/consent', { choice: level });

  if (analytics && hasAnalyticsConsent()) {
    initOptionalGa();
    trackPageView(window.location.pathname);
  }
  window.dispatchEvent(new CustomEvent('emoc:cookie-consent-changed', { detail: { level, prefs } }));
  return { level, prefs };
}

let gaLoaded = false;

export function initOptionalGa() {
  if (gaLoaded || !hasAnalyticsConsent()) return;
  const gaId = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
  if (!/^G-[A-Z0-9]{6,16}$/i.test(gaId)) return;

  gaLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', gaId, { anonymize_ip: true, send_page_view: false });

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(s);
}

let lastTrackedPath = '';
let lastTrackedAt = 0;

function sendFirstPartyEvent(eventType, payload = {}) {
  if (!hasAnalyticsConsent()) return;
  const device = typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop';
  sendBeaconJson('/api/public/analytics/event', {
    type: String(eventType || 'pageview').slice(0, 32),
    path: String(payload.path || window.location.pathname).slice(0, 120),
    label: String(payload.label || '').slice(0, 64),
    durationMs: Number(payload.durationMs || 0),
    device,
  });
}

export function trackPageView(pathname) {
  if (!hasAnalyticsConsent()) return;
  initOptionalGa();

  const cleanPath = String(pathname || '/').split('?')[0];
  const now = Date.now();
  if (cleanPath === lastTrackedPath && now - lastTrackedAt < 1500) return;
  lastTrackedPath = cleanPath;
  lastTrackedAt = now;

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', { page_path: cleanPath });
  }
  sendFirstPartyEvent('pageview', { path: cleanPath });
}

export function trackPageDwell(pathname, durationMs) {
  if (!hasAnalyticsConsent()) return;
  const ms = Math.round(Number(durationMs || 0));
  if (ms < 800 || ms > 1_800_000) return;
  const cleanPath = String(pathname || '/').split('?')[0];
  sendFirstPartyEvent('page_dwell', { path: cleanPath, durationMs: ms });
}

export function trackEvent(eventName, labelOrMeta = '') {
  if (!hasAnalyticsConsent()) return;
  initOptionalGa();
  const formattedLabel =
    typeof labelOrMeta === 'string'
      ? labelOrMeta
      : labelOrMeta && typeof labelOrMeta === 'object'
      ? Object.entries(labelOrMeta)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${k}:${v}`)
          .join(',')
      : '';
  const safeLabel = formattedLabel || String(eventName || 'event');
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, { event_label: safeLabel });
  }
  sendFirstPartyEvent(eventName, { path: window.location.pathname, label: safeLabel });
}
