import crypto from 'crypto';
import express from 'express';
import { auth, db, writeAuditLog } from '../services/firebase.js';
import { requireAuth, getSystemConfig } from '../middleware/auth.js';
import { assertSafeDocId, sanitizeString, isSafeHttpUrl } from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

const inviteLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 10,
  keyFn: (req) => req.user?.uid || req.ip,
  message: 'Çok fazla davet kodu denemesi yapıldı. Lütfen biraz bekleyin.',
});

const apiKeyLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 15,
  keyFn: (req) => req.user?.uid || req.ip,
});

const exportDataLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 5,
  keyFn: (req) => req.user?.uid || req.ip,
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const [txSnap, invitesSnap, serversSnap] = await Promise.all([
      db.collection('wallet_transactions').where('uid', '==', req.user.uid).get(),
      db.collection('invites').where('inviterUid', '==', req.user.uid).get(),
      db.collection('servers').where('ownerUid', '==', req.user.uid).get(),
    ]);

    const transactions = txSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 50);

    const invites = invitesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const { notes: _internalNotes, ...safeProfile } = req.user.profile || {};

    res.json({
      user: {
        ...safeProfile,
        isOwner: req.user.isOwner,
        isAdmin: req.user.isAdmin,
      },
      serverCount: serversSnap.size,
      transactions,
      invites,
    });
  } catch {
    res.status(500).json({ error: 'Kullanıcı profili alınamadı' });
  }
});

router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const updates = {};
    const authUpdates = {};
    if (req.body.displayName !== undefined) {
      const displayName = sanitizeString(req.body.displayName, { minLen: 1, maxLen: 40 });
      if (!displayName) return res.status(400).json({ error: 'Görünen ad boş olamaz' });
      updates.displayName = displayName;
      authUpdates.displayName = displayName;
    }
    if (req.body.photoURL !== undefined) {
      const photoURL = String(req.body.photoURL || '').trim().slice(0, 500);
      if (!isSafeHttpUrl(photoURL, { allowEmpty: true, allowRelativeAssets: true, maxLen: 500 })) {
        return res.status(400).json({ error: 'Geçersiz avatar adresi (yalnızca https://, http:// veya /assets/... desteklenir)' });
      }
      updates.photoURL = photoURL;
      if (!photoURL || /^https?:\/\//i.test(photoURL)) {
        authUpdates.photoURL = photoURL || null;
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan belirtilmedi' });
    }

    await db.collection('users').doc(req.user.uid).update(updates);
    if (Object.keys(authUpdates).length > 0) {
      await auth.updateUser(req.user.uid, authUpdates).catch(() => {});
    }
    res.json({ ok: true, ...updates });
  } catch {
    res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});

router.post('/accept-legal', requireAuth, async (req, res) => {
  try {
    const { acceptedTerms, acceptedKvkk } = req.body;
    if (!acceptedTerms || !acceptedKvkk) {
      return res.status(400).json({ error: 'Hizmet Kullanım Şartları ve KVKK Aydınlatma Metni onayı zorunludur.' });
    }
    const now = Date.now();
    await db.collection('users').doc(req.user.uid).set(
      {
        acceptedTermsAt: now,
        acceptedKvkkAt: now,
      },
      { merge: true }
    );
    res.json({ ok: true, acceptedTermsAt: now, acceptedKvkkAt: now });
  } catch {
    res.status(500).json({ error: 'Yasal onay kaydedilemedi' });
  }
});

router.post('/claim-invite', requireAuth, inviteLimiter, async (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
      return res.status(400).json({ error: 'Geçersiz davet kodu formatı' });
    }

    const sysCfg = await getSystemConfig();
    if (sysCfg.invitePromoActive === false) {
      return res.status(400).json({ error: 'Davet promosyonu şu anda aktif değil' });
    }

    const inviterQuery = await db.collection('users').where('referralCode', '==', code).limit(1).get();
    if (inviterQuery.empty) {
      return res.status(404).json({ error: 'Davet kodu bulunamadı' });
    }

    const inviterDoc = inviterQuery.docs[0];
    if (inviterDoc.id === req.user.uid) {
      return res.status(400).json({ error: 'Kendi davet kodunuzu kullanamazsınız' });
    }
    if (inviterDoc.data()?.banned) {
      return res.status(400).json({ error: 'Bu davet kodu artık kullanılamaz' });
    }

    const rewardInviter = Number(sysCfg.inviteRewardInviter || 25);
    const rewardInvited = Number(sysCfg.inviteRewardInvited || 15);

    await db.runTransaction(async (tx) => {
      const meRef = db.collection('users').doc(req.user.uid);
      const invRef = db.collection('users').doc(inviterDoc.id);
      const meSnap = await tx.get(meRef);
      const invSnap = await tx.get(invRef);

      if (!meSnap.exists || !invSnap.exists) throw new Error('Kullanıcı kaydı bulunamadı');
      const meData = meSnap.data();
      const invData = invSnap.data();

      if (meData.referredBy) {
        throw new Error('Hesabınızda zaten bir davet kodu kullanılmış');
      }

      tx.update(meRef, {
        referredBy: inviterDoc.id,
        referredCode: code,
        balance: Number(meData.balance || 0) + rewardInvited,
        xp: Number(meData.xp || 0) + 50,
      });

      tx.update(invRef, {
        balance: Number(invData.balance || 0) + rewardInviter,
        referralCount: Number(invData.referralCount || 0) + 1,
        referralEarnings: Number(invData.referralEarnings || 0) + rewardInviter,
        xp: Number(invData.xp || 0) + 100,
      });

      const now = Date.now();
      tx.set(db.collection('invites').doc(), {
        inviterUid: inviterDoc.id,
        inviterEmail: invData.email,
        invitedUid: req.user.uid,
        invitedEmail: meData.email,
        code,
        rewardInviter,
        rewardInvited,
        createdAt: now,
      });

      tx.set(db.collection('wallet_transactions').doc(), {
        uid: inviterDoc.id,
        email: invData.email,
        type: 'invite_reward',
        amount: rewardInviter,
        note: `Davet ödülü (${meData.email})`,
        adminEmail: 'system',
        createdAt: now,
      });

      tx.set(db.collection('wallet_transactions').doc(), {
        uid: req.user.uid,
        email: meData.email,
        type: 'invite_reward',
        amount: rewardInvited,
        note: `Davet kodu hoş geldin bonusu (${code})`,
        adminEmail: 'system',
        createdAt: now,
      });
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'INVITE_CLAIMED',
      targetType: 'user',
      targetId: inviterDoc.id,
      details: { code, rewardInviter, rewardInvited },
    });

    res.json({ ok: true, rewardInvited, message: `Davet kodu uygulandı! +${rewardInvited} İnvite hesabınıza eklendi.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const [personalSnap, globalSnap] = await Promise.all([
      db.collection('user_notifications').where('uid', '==', req.user.uid).get(),
      db.collection('user_notifications').where('uid', '==', 'all').get(),
    ]);

    const items = [...personalSnap.docs, ...globalSnap.docs]
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30);

    res.json({ notifications: items });
  } catch {
    res.status(500).json({ error: 'Bildirimler alınamadı' });
  }
});

// Notification & UI Preferences
router.patch('/preferences', requireAuth, async (req, res) => {
  try {
    const incoming = req.body || {};
    const nextPrefs = {
      serverPowerAlerts: incoming.serverPowerAlerts !== false,
      giveawayAlerts: incoming.giveawayAlerts !== false,
      walletAlerts: incoming.walletAlerts !== false,
      changelogPopups: incoming.changelogPopups !== false,
      updatedAt: Date.now(),
    };
    await db.collection('users').doc(req.user.uid).set({ preferences: nextPrefs }, { merge: true });
    res.json({ ok: true, preferences: nextPrefs });
  } catch {
    res.status(500).json({ error: 'Tercihler kaydedilemedi' });
  }
});

// Personal API Keys
router.get('/api-keys', requireAuth, async (req, res) => {
  if (req.user.viaApiKey) {
    return res.status(403).json({ error: 'API anahtarları yalnızca etkileşimli hesap oturumu ile yönetilebilir' });
  }
  try {
    const snap = await db.collection('api_keys').where('uid', '==', req.user.uid).get();
    const keys = snap.docs
      .map((d) => {
        const x = d.data();
        return {
          id: d.id,
          label: x.label,
          prefix: x.prefix,
          createdAt: x.createdAt,
          lastUsedAt: x.lastUsedAt || null,
          revoked: Boolean(x.revoked),
        };
      })
      .filter((k) => !k.revoked)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ keys });
  } catch {
    res.status(500).json({ error: 'API anahtarları alınamadı' });
  }
});

router.post('/api-keys', requireAuth, apiKeyLimiter, async (req, res) => {
  if (req.user.viaApiKey) {
    return res.status(403).json({ error: 'API anahtarı oluşturmak için etkileşimli oturum gereklidir' });
  }
  try {
    const sysCfg = await getSystemConfig();
    if (sysCfg.allowUserApiKeys === false && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Kişisel API anahtarı oluşturma yönetici tarafından devre dışı bırakılmıştır.' });
    }
    const label = sanitizeString(req.body?.label, { minLen: 1, maxLen: 50 }) || 'API Anahtarı';
    const existingSnap = await db.collection('api_keys').where('uid', '==', req.user.uid).get();
    const activeCount = existingSnap.docs.filter((d) => !d.data().revoked).length;
    if (activeCount >= 5) {
      return res.status(400).json({ error: 'En fazla 5 adet aktif API anahtarı oluşturabilirsiniz.' });
    }

    const secret = `emoc_live_${crypto.randomBytes(24).toString('hex')}`;
    const hash = crypto.createHash('sha256').update(secret).digest('hex');
    const prefix = `${secret.slice(0, 16)}...${secret.slice(-4)}`;
    const now = Date.now();

    await db.collection('api_keys').doc(hash).set({
      uid: req.user.uid,
      email: req.user.email,
      label,
      prefix,
      revoked: false,
      createdAt: now,
      lastUsedAt: null,
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'API_KEY_CREATED',
      targetType: 'api_key',
      targetId: prefix,
    });

    res.status(201).json({ ok: true, id: hash, label, prefix, secret, createdAt: now });
  } catch {
    res.status(500).json({ error: 'API anahtarı oluşturulamadı' });
  }
});

router.delete('/api-keys/:id', requireAuth, async (req, res) => {
  if (req.user.viaApiKey) {
    return res.status(403).json({ error: 'API anahtarı silmek için etkileşimli oturum gereklidir' });
  }
  try {
    const keyId = assertSafeDocId(req.params.id, 'API anahtarı kimliği');
    const ref = db.collection('api_keys').doc(keyId);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.uid !== req.user.uid) {
      return res.status(404).json({ error: 'API anahtarı bulunamadı' });
    }
    await ref.delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// KVKK Personal Data Portability Export
router.get('/export-my-data', requireAuth, exportDataLimiter, async (req, res) => {
  try {
    const [srvSnap, txSnap, tktSnap] = await Promise.all([
      db.collection('servers').where('ownerUid', '==', req.user.uid).get(),
      db.collection('wallet_transactions').where('uid', '==', req.user.uid).get(),
      db.collection('tickets').where('uid', '==', req.user.uid).get(),
    ]);
    const { notes: _internalNotes, ...safeProfile } = req.user.profile || {};
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      platform: 'EmoçHosting',
      profile: safeProfile,
      servers: srvSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        category: d.data().category,
        domainAddress: d.data().domainAddress,
        status: d.data().status,
        createdAt: d.data().createdAt,
      })),
      walletTransactions: txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      tickets: tktSnap.docs.map((d) => {
        const { internalNote: _hiddenNote, ...rest } = d.data();
        return { id: d.id, ...rest };
      }),
    };
    res.setHeader('Content-Disposition', `attachment; filename="emochosting-kvkk-verilerim-${req.user.uid.slice(0, 8)}.json"`);
    res.json(exportPayload);
  } catch {
    res.status(500).json({ error: 'Veri dışa aktarılamadı' });
  }
});

export default router;
