import crypto from 'crypto';
import express from 'express';
import { db, auth, writeAuditLog } from '../services/firebase.js';
import { requireAuth, getSystemConfig } from '../middleware/auth.js';
import { assertSafeDocId, parseFiniteNumber } from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

const boxOpenLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyFn: (req) => req.user?.uid || req.ip,
});

const giveawayJoinLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => req.user?.uid || req.ip,
});

const RARITY_POOL = [
  { maxRoll: 30, discount: 10, tier: 'common', tierLabel: 'Standart Teklif' },
  { maxRoll: 55, discount: 15, tier: 'uncommon', tierLabel: 'Özel Fırsat' },
  { maxRoll: 75, discount: 20, tier: 'rare', tierLabel: 'Altın Aslan' },
  { maxRoll: 90, discount: 25, tier: 'epic', tierLabel: 'Destansı Fırsat' },
  { maxRoll: 97, discount: 35, tier: 'ultra', tierLabel: 'Kraliyet İndirimi' },
  { maxRoll: 100, discount: 50, tier: 'mythic', tierLabel: 'Efsanevi Gece Pazarı' },
];

function rollNightMarketDiscount() {
  const r = crypto.randomInt(0, 100);
  return RARITY_POOL.find((item) => r < item.maxRoll) || RARITY_POOL[0];
}

function getWeekCycleDates(cooldownDays = 7) {
  const now = Date.now();
  const periodMs = Math.max(1, Number(cooldownDays || 7)) * 24 * 60 * 60 * 1000;
  return { now, nextResetAt: now + periodMs };
}

async function ensureUserNightMarket(uid, sysCfg) {
  const uRef = db.collection('users').doc(uid);
  const uSnap = await uRef.get();
  if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı');
  const uData = uSnap.data() || {};
  const cooldownDays = Number(sysCfg.nightMarketCooldownDays || 7);
  const boxCount = Math.min(6, Math.max(1, Number(sysCfg.nightMarketBoxCount || 3)));
  const now = Date.now();

  let nm = uData.nightMarket;
  if (!nm || !Array.isArray(nm.boxes) || nm.boxes.length !== boxCount || now >= Number(nm.nextResetAt || 0)) {
    const { nextResetAt } = getWeekCycleDates(cooldownDays);
    nm = {
      cycleId: `${new Date(now).toISOString().slice(0, 10)}-${crypto.randomBytes(2).toString('hex')}`,
      createdAt: now,
      nextResetAt,
      boxes: Array.from({ length: boxCount }, (_, slot) => ({
        slot,
        opened: false,
        openedAt: null,
        discountPct: null,
        tier: null,
        tierLabel: null,
        couponCode: null,
        categoryFilter: 'all',
      })),
    };
    await uRef.update({ nightMarket: nm });
  }
  return nm;
}

router.get('/night-market', requireAuth, async (req, res) => {
  try {
    const sysCfg = await getSystemConfig();
    if (sysCfg.nightMarketEnabled === false) {
      return res.json({ enabled: false, nightMarket: null });
    }
    const nm = await ensureUserNightMarket(req.user.uid, sysCfg);

    // Check which coupons have already been consumed by user
    const codes = (nm.boxes || []).map((b) => b.couponCode).filter(Boolean);
    const usedSet = new Set();
    if (codes.length > 0) {
      const snaps = await Promise.all(codes.map((c) => db.collection('coupons').doc(c).get()));
      for (const s of snaps) {
        if (s.exists && (s.data().usedCount || 0) >= (s.data().maxUses || 1)) {
          usedSet.add(s.id);
        }
      }
    }

    const boxes = (nm.boxes || []).map((b) => ({
      ...b,
      used: b.couponCode ? usedSet.has(b.couponCode) : false,
    }));

    res.json({
      enabled: true,
      cooldownDays: Number(sysCfg.nightMarketCooldownDays || 7),
      nightMarket: { ...nm, boxes },
    });
  } catch {
    res.status(500).json({ error: 'Gece Pazarı yüklenemedi' });
  }
});

router.post('/night-market/open/:slot', requireAuth, boxOpenLimiter, async (req, res) => {
  try {
    const slotIdx = parseFiniteNumber(req.params.slot, { min: 0, max: 5, integer: true, label: 'Kutu sırası' });
    const sysCfg = await getSystemConfig();
    if (sysCfg.nightMarketEnabled === false) {
      return res.status(403).json({ error: 'Gece Pazarı şu anda yönetici tarafından devre dışı bırakılmış' });
    }

    await ensureUserNightMarket(req.user.uid, sysCfg);
    const uRef = db.collection('users').doc(req.user.uid);
    let openedBox = null;
    let updatedNm = null;

    await db.runTransaction(async (tx) => {
      const uSnap = await tx.get(uRef);
      if (!uSnap.exists) throw new Error('Kullanıcı bulunamadı');
      const nm = uSnap.data()?.nightMarket;
      if (!nm || !Array.isArray(nm.boxes) || slotIdx < 0 || slotIdx >= nm.boxes.length) {
        throw new Error('Geçersiz Gece Pazarı kutusu');
      }
      if (nm.boxes[slotIdx].opened) {
        throw new Error('Bu hafta bu kutu zaten açıldı!');
      }

      const rolled = rollNightMarketDiscount();
      const couponCode = `GECE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const now = Date.now();
      const categories = ['all', 'all', 'all', 'minecraft', 'web', 'discord'];
      const categoryFilter = categories[crypto.randomInt(0, categories.length)];

      openedBox = {
        slot: slotIdx,
        opened: true,
        openedAt: now,
        discountPct: rolled.discount,
        tier: rolled.tier,
        tierLabel: rolled.tierLabel,
        couponCode,
        categoryFilter,
      };

      const nextBoxes = [...nm.boxes];
      nextBoxes[slotIdx] = openedBox;
      updatedNm = { ...nm, boxes: nextBoxes };

      tx.update(uRef, { nightMarket: updatedNm });
      tx.set(db.collection('coupons').doc(couponCode), {
        code: couponCode,
        discountType: 'percent',
        value: rolled.discount,
        minAmount: 0,
        maxUses: 1,
        usedCount: 0,
        ownerUid: req.user.uid,
        source: 'night_market',
        categoryFilter,
        active: true,
        expiresAt: nm.nextResetAt,
        createdBy: 'night_market',
        createdAt: now,
      });
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'NIGHT_MARKET_BOX_OPENED',
      targetType: 'coupon',
      targetId: openedBox.couponCode,
      details: { slot: slotIdx, discountPct: openedBox.discountPct, categoryFilter: openedBox.categoryFilter },
    });

    res.json({ ok: true, box: openedBox, nightMarket: updatedNm });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= GIVEAWAYS =================
router.get('/giveaways', async (req, res) => {
  try {
    let viewerUid = null;
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) {
      try {
        const dec = await auth.verifyIdToken(header.slice(7).trim(), true);
        viewerUid = dec.uid;
      } catch {}
    }

    const snap = await db.collection('giveaways').orderBy('createdAt', 'desc').limit(30).get();
    const items = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data();
        let joined = false;
        if (viewerUid) {
          const eSnap = await d.ref.collection('entries').doc(viewerUid).get();
          joined = eSnap.exists;
        }
        return {
          id: d.id,
          title: data.title,
          description: data.description,
          prizeType: data.prizeType,
          prizeValue: data.prizeValue,
          prizeLabel: data.prizeLabel,
          winnerCount: data.winnerCount || 1,
          minXp: data.minXp || 0,
          participantCount: data.participantCount || 0,
          status: data.status,
          endsAt: data.endsAt,
          drawnAt: data.drawnAt || null,
          createdAt: data.createdAt,
          joined,
          // Privacy & notification-first: never expose winner identities on public list
          wonByMe: Boolean(viewerUid && Array.isArray(data.winners) && data.winners.some((w) => w.uid === viewerUid)),
          winnersNotifiedCount: Array.isArray(data.winners) ? data.winners.length : 0,
        };
      })
    );
    res.json({ giveaways: items });
  } catch {
    res.status(500).json({ error: 'Çekilişler yüklenemedi' });
  }
});

router.post('/giveaways/:id/join', requireAuth, giveawayJoinLimiter, async (req, res) => {
  try {
    const giveawayId = assertSafeDocId(req.params.id, 'çekiliş kimliği');
    const gRef = db.collection('giveaways').doc(giveawayId);
    const entryRef = gRef.collection('entries').doc(req.user.uid);
    const now = Date.now();
    let count = 0;

    await db.runTransaction(async (tx) => {
      const [gSnap, eSnap] = await Promise.all([tx.get(gRef), tx.get(entryRef)]);
      if (!gSnap.exists) throw new Error('Çekiliş bulunamadı');
      const g = gSnap.data();
      if (g.status !== 'active') throw new Error('Bu çekiliş artık aktif değil');
      if (g.endsAt && now > g.endsAt) throw new Error('Çekiliş katılım süresi doldu');
      if (eSnap.exists) throw new Error('Bu çekilişe zaten katıldınız');

      const minXp = Number(g.minXp || 0);
      if (minXp > 0 && Number(req.user.profile?.xp || 0) < minXp) {
        throw new Error(`Bu çekiliş için minimum ${minXp} XP gerekiyor (Mevcut: ${req.user.profile?.xp || 0} XP)`);
      }

      count = Number(g.participantCount || 0) + 1;
      tx.set(entryRef, {
        uid: req.user.uid,
        email: req.user.email,
        displayName: req.user.displayName || 'Üye',
        joinedAt: now,
      });
      tx.update(gRef, { participantCount: count });
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'GIVEAWAY_JOINED',
      targetType: 'giveaway',
      targetId: giveawayId,
    });

    res.json({ ok: true, participantCount: count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
