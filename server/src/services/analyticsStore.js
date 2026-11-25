import { db, firebaseStatus } from './firebase.js';
import { ENV } from '../config/env.js';
import { sanitizeString } from '../utils/security.js';

const DOC_PATH = db.collection('analytics_aggregates').doc('global');
const MAX_PATHS = 80;
const MAX_INTERESTS = 100;

let state = {
  startedAt: Date.now(),
  updatedAt: Date.now(),
  totalPageviews: 0,
  totalCtaClicks: 0,
  totalDwellMs: 0,
  totalDwellSamples: 0,
  consentStats: {
    acceptedAll: 0,
    essentialOnly: 0,
  },
  deviceStats: {
    desktop: 0,
    mobile: 0,
  },
  paths: {},
  interests: {},
};

let loaded = false;
let flushTimer = null;

async function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    const snap = await DOC_PATH.get();
    if (snap.exists) {
      const data = snap.data() || {};
      state = {
        startedAt: Number(data.startedAt || Date.now()),
        updatedAt: Number(data.updatedAt || Date.now()),
        totalPageviews: Number(data.totalPageviews || 0),
        totalCtaClicks: Number(data.totalCtaClicks || 0),
        totalDwellMs: Number(data.totalDwellMs || 0),
        totalDwellSamples: Number(data.totalDwellSamples || 0),
        consentStats: {
          acceptedAll: Number(data.consentStats?.acceptedAll || 0),
          essentialOnly: Number(data.consentStats?.essentialOnly || 0),
        },
        deviceStats: {
          desktop: Number(data.deviceStats?.desktop || 0),
          mobile: Number(data.deviceStats?.mobile || 0),
        },
        paths: data.paths && typeof data.paths === 'object' ? data.paths : {},
        interests: data.interests && typeof data.interests === 'object' ? data.interests : {},
      };
    }
  } catch {
    // Fallback gracefully to in-memory state if emulator is still booting
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    try {
      await DOC_PATH.set({ ...state, updatedAt: Date.now() }, { merge: false });
    } catch {
      // ignore transient write errors
    }
  }, 5000);
}

function normalizePublicPath(rawPath = '/') {
  const base = String(rawPath || '/').split('?')[0].split('#')[0].trim() || '/';
  const adminSeg = ENV.ADMIN_PATH.toLowerCase();
  const lower = base.toLowerCase();
  if (lower.startsWith(adminSeg) || lower.startsWith('/admin') || lower.startsWith('/api')) {
    return null;
  }
  if (/^\/servers\/[a-zA-Z0-9_-]+$/.test(base)) {
    return '/servers/:id';
  }
  return /^\/[a-zA-Z0-9/_-]{0,100}$/.test(base) ? base : '/';
}

export async function recordConsentChoice(choice) {
  await ensureLoaded();
  if (choice === 'all') {
    state.consentStats.acceptedAll += 1;
  } else {
    state.consentStats.essentialOnly += 1;
  }
  state.updatedAt = Date.now();
  scheduleFlush();
}

export async function recordAnalyticsEvent({ type = 'pageview', path = '/', label = '', durationMs = 0, device = 'desktop' } = {}) {
  await ensureLoaded();
  const cleanType = sanitizeString(type, { minLen: 1, maxLen: 32 }) || 'pageview';
  const cleanPath = normalizePublicPath(path);
  if (!cleanPath) return;

  const cleanDevice = device === 'mobile' ? 'mobile' : 'desktop';
  const cleanLabel = sanitizeString(label, { maxLen: 64 }) || '';
  const now = Date.now();

  if (cleanType === 'pageview') {
    state.totalPageviews += 1;
    state.deviceStats[cleanDevice] += 1;
    if (Object.keys(state.paths).length < MAX_PATHS || cleanPath in state.paths) {
      const cur = state.paths[cleanPath] || { views: 0, totalDwellMs: 0, dwellCount: 0, lastViewedAt: now };
      cur.views = Number(cur.views || 0) + 1;
      cur.lastViewedAt = now;
      state.paths[cleanPath] = cur;
    }
  } else if (cleanType === 'page_dwell') {
    const ms = Math.round(Number(durationMs || 0));
    if (Number.isFinite(ms) && ms >= 500 && ms <= 1_800_000) {
      state.totalDwellMs += ms;
      state.totalDwellSamples += 1;
      if (Object.keys(state.paths).length < MAX_PATHS || cleanPath in state.paths) {
        const cur = state.paths[cleanPath] || { views: 0, totalDwellMs: 0, dwellCount: 0, lastViewedAt: now };
        cur.totalDwellMs = Number(cur.totalDwellMs || 0) + ms;
        cur.dwellCount = Number(cur.dwellCount || 0) + 1;
        cur.lastViewedAt = now;
        state.paths[cleanPath] = cur;
      }
    }
  } else if (/^[a-z0-9_:-]{1,32}$/i.test(cleanType)) {
    state.totalCtaClicks += 1;
    const key = cleanLabel || cleanType;
    if (Object.keys(state.interests).length < MAX_INTERESTS || key in state.interests) {
      const cur = state.interests[key] || { clicks: 0, lastPath: cleanPath, lastAt: now };
      cur.clicks = Number(cur.clicks || 0) + 1;
      cur.lastPath = cleanPath;
      cur.lastAt = now;
      state.interests[key] = cur;
    }
  }

  state.updatedAt = now;
  scheduleFlush();
}

export async function getAnalyticsReport() {
  await ensureLoaded();
  const pathList = Object.entries(state.paths).map(([p, v]) => {
    const views = Number(v.views || 0);
    const dwellCount = Number(v.dwellCount || 0);
    const totalDwellMs = Number(v.totalDwellMs || 0);
    const avgDwellSec = dwellCount > 0 ? Number((totalDwellMs / dwellCount / 1000).toFixed(1)) : 0;
    const totalDwellSec = Number((totalDwellMs / 1000).toFixed(1));
    return {
      path: p,
      views,
      dwellCount,
      avgDwellSec,
      totalDwellSec,
      lastViewedAt: Number(v.lastViewedAt || 0),
    };
  });

  const topByViews = [...pathList].sort((a, b) => b.views - a.views).slice(0, 15);
  const topByDwellTime = [...pathList].sort((a, b) => b.totalDwellSec - a.totalDwellSec || b.avgDwellSec - a.avgDwellSec).slice(0, 15);

  const topInterests = Object.entries(state.interests)
    .map(([label, v]) => ({
      label,
      clicks: Number(v.clicks || 0),
      lastPath: v.lastPath || '/',
      lastAt: Number(v.lastAt || 0),
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  const totalConsent = state.consentStats.acceptedAll + state.consentStats.essentialOnly;
  const consentAcceptRate =
    totalConsent > 0 ? Number(((state.consentStats.acceptedAll / totalConsent) * 100).toFixed(1)) : 0;

  return {
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    totalPageviews: state.totalPageviews,
    totalCtaClicks: state.totalCtaClicks,
    totalDwellSamples: state.totalDwellSamples,
    avgOverallDwellSec:
      state.totalDwellSamples > 0 ? Number((state.totalDwellMs / state.totalDwellSamples / 1000).toFixed(1)) : 0,
    consentStats: { ...state.consentStats, total: totalConsent, acceptRatePct: consentAcceptRate },
    deviceStats: { ...state.deviceStats },
    topByViews,
    topByDwellTime,
    topInterests,
    mode: firebaseStatus.mode === 'emulator' ? 'emulator' : 'cloud',
  };
}

export async function resetAnalyticsReport() {
  state = {
    startedAt: Date.now(),
    updatedAt: Date.now(),
    totalPageviews: 0,
    totalCtaClicks: 0,
    totalDwellMs: 0,
    totalDwellSamples: 0,
    consentStats: { acceptedAll: 0, essentialOnly: 0 },
    deviceStats: { desktop: 0, mobile: 0 },
    paths: {},
    interests: {},
  };
  try {
    await DOC_PATH.set(state, { merge: false });
  } catch {}
  return getAnalyticsReport();
}
