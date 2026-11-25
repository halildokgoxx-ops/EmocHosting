import express from 'express';
import { db, seedInitialDataIfNeeded } from '../services/firebase.js';
import { getLatestTelemetry } from '../services/telemetry.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { sanitizeString } from '../utils/security.js';
import { recordAnalyticsEvent, recordConsentChoice } from '../services/analyticsStore.js';

const router = express.Router();

const analyticsLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 90,
});

const BOOTSTRAP_TTL_MS = 15_000;
let bootstrapCache = {
  payload: null,
  expiresAt: 0,
};

export function invalidateBootstrapCache() {
  bootstrapCache.expiresAt = 0;
  bootstrapCache.payload = null;
}

async function loadBootstrapFromDb() {
  const [cfgSnap, pkgSnap, incSnap, annSnap, usersSnap, tplSnap, clSnap] = await Promise.all([
    db.collection('system_config').doc('global').get(),
    db.collection('packages').get(),
    db.collection('incidents').orderBy('createdAt', 'desc').limit(10).get(),
    db.collection('announcements').orderBy('createdAt', 'desc').limit(10).get(),
    db.collection('users').get(),
    db.collection('starter_templates').get(),
    db.collection('changelogs').orderBy('createdAt', 'desc').limit(5).get(),
  ]);

  const rawCfg = cfgSnap.exists ? cfgSnap.data() : {};
  const publicConfig = {};
  for (const [k, v] of Object.entries(rawCfg)) {
    if (/secret|token|password|apikey|api_key|webhook|privatekey/i.test(k)) continue;
    publicConfig[k] = v;
  }

  const packages = pkgSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p) => p.active !== false)
    .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));

  const incidents = incSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const announcements = annSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.active !== false);
  const templates = tplSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.active !== false);
  const changelogs = clSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.active !== false);
  const latestChangelog = changelogs[0] || null;

  // Real leaderboard computed from Firestore users (privacy-safe: omit uid, email, totalSpent)
  const allUsers = usersSnap.docs.map((d) => d.data()).filter((u) => !u.banned);
  const leaderboardByInvites = [...allUsers]
    .sort((a, b) => (b.referralCount || 0) - (a.referralCount || 0) || (b.xp || 0) - (a.xp || 0))
    .slice(0, 15)
    .map((u, idx) => ({
      rank: idx + 1,
      displayName: u.displayName || 'Kullanıcı',
      referralCount: u.referralCount || 0,
      xp: u.xp || 0,
      badges: Array.isArray(u.badges) ? u.badges : [],
    }));

  const leaderboardByXp = [...allUsers]
    .sort((a, b) => (b.xp || 0) - (a.xp || 0) || (b.referralCount || 0) - (a.referralCount || 0))
    .slice(0, 15)
    .map((u, idx) => ({
      rank: idx + 1,
      displayName: u.displayName || 'Kullanıcı',
      referralCount: u.referralCount || 0,
      xp: u.xp || 0,
      badges: Array.isArray(u.badges) ? u.badges : [],
    }));

  return {
    config: publicConfig,
    packages,
    incidents,
    announcements,
    templates,
    changelogs,
    latestChangelog,
    leaderboard: {
      byInvites: leaderboardByInvites,
      byXp: leaderboardByXp,
    },
    totalUsers: allUsers.length,
  };
}

router.get('/bootstrap', async (req, res) => {
  try {
    const now = Date.now();
    let staticData = bootstrapCache.payload;

    if (!staticData || now >= bootstrapCache.expiresAt) {
      staticData = await loadBootstrapFromDb();
      if (staticData.packages.length === 0 || !staticData.config?.tosText) {
        await seedInitialDataIfNeeded();
        staticData = await loadBootstrapFromDb();
      }
      if (staticData.packages.length > 0 && staticData.config?.tosText) {
        bootstrapCache = { payload: staticData, expiresAt: now + BOOTSTRAP_TTL_MS };
      }
    }

    const telemetry = getLatestTelemetry();

    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      config: staticData.config,
      packages: staticData.packages,
      incidents: staticData.incidents,
      announcements: staticData.announcements,
      templates: staticData.templates,
      changelogs: staticData.changelogs,
      latestChangelog: staticData.latestChangelog,
      leaderboard: staticData.leaderboard,
      stats: {
        totalUsers: staticData.totalUsers,
        totalServers: telemetry.totals.totalServers,
        runningServers: telemetry.totals.runningServers,
        hostUptimeSec: telemetry.host.uptimeSec,
      },
    });
  } catch {
    res.status(500).json({ error: 'Sistem verisi yüklenemedi' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const telemetry = getLatestTelemetry();
    const incSnap = await db.collection('incidents').orderBy('createdAt', 'desc').limit(15).get();
    res.json({
      host: {
        cpuLoadPct: telemetry.host.cpuLoadPct,
        ramUsedPct: telemetry.host.ramUsedPct,
        uptimeSec: telemetry.host.uptimeSec,
      },
      totals: {
        totalServers: telemetry.totals.totalServers,
        runningServers: telemetry.totals.runningServers,
        byCategory: telemetry.totals.byCategory,
      },
      incidents: incSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      history: telemetry.history || [],
      updatedAt: telemetry.updatedAt,
    });
  } catch {
    res.status(500).json({ error: 'Durum bilgisi alınamadı' });
  }
});

// Privacy-first anonymous cookie consent ratio counter (zero PII/IP)
router.post('/analytics/consent', analyticsLimiter, async (req, res) => {
  try {
    const choice = req.body?.choice === 'all' ? 'all' : 'essential';
    await recordConsentChoice(choice);
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

// Privacy-first, consent-aware anonymous analytics beacon (no cookies, no IP, no user IDs)
router.post('/analytics/event', analyticsLimiter, async (req, res) => {
  try {
    await recordAnalyticsEvent({
      type: sanitizeString(req.body?.type || 'pageview', { minLen: 1, maxLen: 32 }) || 'pageview',
      path: req.body?.path,
      label: req.body?.label,
      durationMs: req.body?.durationMs,
      device: req.body?.device,
    });
    res.status(204).end();
  } catch {
    res.status(204).end();
  }
});

export default router;
