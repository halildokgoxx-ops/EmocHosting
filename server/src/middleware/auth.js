import crypto from 'crypto';
import { auth, db, firebaseStatus, verifyFirebaseToken } from '../services/firebase.js';
import { ENV } from '../config/env.js';
import { getClientIp, isSafeHttpUrl, sanitizeString } from '../utils/security.js';

function makeReferralCode(uid) {
  return 'EMOC-' + crypto.createHash('sha1').update(uid).digest('hex').slice(0, 6).toUpperCase();
}

export function isOwnerEmail(email = '') {
  return String(email).toLowerCase().trim() === ENV.OWNER_ADMIN_EMAIL;
}

export async function getSystemConfig() {
  const snap = await db.collection('system_config').doc('global').get();
  return snap.exists ? snap.data() : { maintenanceMode: false, registrationOpen: true, onlyOwnerAdminMode: false };
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const apiKeyHeader = String(req.headers['x-api-key'] || '').trim();
    const token = apiKeyHeader || (header.startsWith('Bearer ') ? header.slice(7).trim() : '');

    if (!token) {
      return res.status(401).json({ error: 'Oturum anahtarı bulunamadı. Lütfen giriş yapın.' });
    }

    let decoded = null;
    if (token.startsWith('emoc_live_')) {
      if (!/^emoc_live_[a-f0-9]{48}$/.test(token)) {
        return res.status(401).json({ error: 'Geçersiz API anahtarı biçimi.' });
      }
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const keySnap = await db.collection('api_keys').doc(hash).get();
      if (!keySnap.exists || keySnap.data()?.revoked) {
        return res.status(401).json({ error: 'Geçersiz veya iptal edilmiş API anahtarı.' });
      }
      const keyData = keySnap.data();
      decoded = { uid: keyData.uid, email: keyData.email || '', viaApiKey: true, email_verified: false };
      keySnap.ref.update({ lastUsedAt: Date.now() }).catch(() => {});
    } else {
      decoded = await verifyFirebaseToken(token);
    }

    const email = (decoded.email || '').toLowerCase().trim();
    const uid = decoded.uid;
    const isVerifiedForCloud = firebaseStatus.mode === 'emulator' || decoded.email_verified === true;

    // Check IP ban list using normalized non-spoofable IP
    const clientIp = getClientIp(req);
    if (clientIp && !(isOwnerEmail(email) && isVerifiedForCloud && !decoded.viaApiKey)) {
      const ipBanSnap = await db.collection('ip_bans').where('ip', '==', clientIp).limit(1).get();
      if (!ipBanSnap.empty) {
        return res.status(403).json({ error: 'Bu IP adresi platform yöneticisi tarafından engellenmiştir.' });
      }
    }

    const sysConfig = await getSystemConfig();
    const userRef = db.collection('users').doc(uid);
    let userSnap = await userRef.get();
    const ownerCandidate = isOwnerEmail(email) && isVerifiedForCloud;

    if (!userSnap.exists) {
      if (decoded.viaApiKey) {
        return res.status(401).json({ error: 'Geçersiz API anahtarı sahibi.' });
      }
      if (sysConfig.registrationOpen === false && !ownerCandidate) {
        return res.status(403).json({ error: 'Yeni kullanıcı kayıtları şu anda yönetici tarafından kapatılmıştır.' });
      }

      const safeDisplayName =
        sanitizeString(decoded.name || email.split('@')[0] || 'EmoçÜye', { minLen: 1, maxLen: 40 }) || 'EmoçÜye';
      const safePhotoUrl = isSafeHttpUrl(decoded.picture, { allowEmpty: true, allowRelativeAssets: true })
        ? String(decoded.picture || '').trim()
        : '';

      const initialData = {
        uid,
        email,
        displayName: safeDisplayName,
        photoURL: safePhotoUrl,
        role: ownerCandidate ? 'owner' : 'user',
        isAdmin: ownerCandidate,
        balance: Number(sysConfig.defaultStartingBalance || 0),
        totalSpent: 0,
        banned: false,
        banReason: '',
        bannedUntil: null,
        referralCode: makeReferralCode(uid),
        referredBy: null,
        referralCount: 0,
        referralEarnings: 0,
        xp: ownerCandidate ? 1000 : 50,
        badges: ownerCandidate ? ['Kurucu', 'Owner'] : ['Üye'],
        notes: '',
        lastIp: clientIp,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      };
      await userRef.set(initialData);
      userSnap = await userRef.get();
    } else if (!decoded.viaApiKey) {
      const updatePatch = {
        lastIp: clientIp,
        lastLoginAt: Date.now(),
      };
      if (email) updatePatch.email = email;
      if (ownerCandidate) {
        updatePatch.role = 'owner';
        updatePatch.isAdmin = true;
      }
      await userRef.set(updatePatch, { merge: true });
      userSnap = await userRef.get();
    }

    const profile = userSnap.data();

    // Check ban state (never lock out verified owner)
    if (profile.banned && !(ownerCandidate && !decoded.viaApiKey)) {
      if (profile.bannedUntil && Date.now() > profile.bannedUntil) {
        await userRef.update({ banned: false, banReason: '', bannedUntil: null });
        profile.banned = false;
      } else {
        return res.status(403).json({
          error: `Hesabınız yasaklanmıştır. Sebep: ${profile.banReason || 'Kural ihlali'}`,
          banned: true,
        });
      }
    }

    // Personal API keys never grant Admin/Owner console privileges
    const isOwner = !decoded.viaApiKey && ownerCandidate;
    const canAdmin =
      !decoded.viaApiKey &&
      isVerifiedForCloud &&
      (isOwner || (!sysConfig.onlyOwnerAdminMode && profile.isAdmin === true));

    // Check maintenance mode
    if (sysConfig.maintenanceMode && !canAdmin) {
      return res.status(503).json({
        error: sysConfig.maintenanceMessage || 'Sistem bakım modundadır.',
        maintenanceMode: true,
      });
    }

    req.user = {
      uid,
      email: email || profile.email || '',
      displayName: profile.displayName,
      viaApiKey: Boolean(decoded.viaApiKey),
      emailVerified: isVerifiedForCloud,
      isOwner,
      isAdmin: canAdmin,
      profile,
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum.' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin || req.user.viaApiKey) {
    return res.status(403).json({
      error: 'Yetkisiz erişim! Bu alan yalnızca yetkili yöneticilere açıktır.',
    });
  }
  next();
}

export function requireOwnerAdmin(req, res, next) {
  if (!req.user || !req.user.isOwner || req.user.viaApiKey) {
    return res.status(403).json({
      error: 'Bu kritik işlem yalnızca kurucu yönetici tarafından yapılabilir.',
    });
  }
  next();
}
