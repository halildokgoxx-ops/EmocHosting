import fs from 'fs';
import path from 'path';
import express from 'express';
import { auth, db, writeAuditLog } from '../services/firebase.js';
import { requireAuth, requireAdmin, requireOwnerAdmin, isOwnerEmail } from '../middleware/auth.js';
import { getLatestTelemetry, getDirSizeMb } from '../services/telemetry.js';
import {
  activeProcesses,
  startServer,
  stopServer,
  restartServer,
  deleteServerWorkspace,
  deleteServerBackupZip,
} from '../services/processManager.js';
import { sendDiscordWebhook } from '../services/webhook.js';
import { drawGiveawayWinners } from '../services/giveawayService.js';
import { pushUserNotification } from '../services/notifications.js';
import { BACKUPS_DIR, INSTANCES_DIR, ENV } from '../config/env.js';
import {
  assertSafeDocId,
  parseFiniteNumber,
  sanitizeString,
  isSafeHttpUrl,
  isSafeDiscordWebhookUrl,
  isValidIpAddress,
} from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { invalidateBootstrapCache } from './public.js';
import { getAnalyticsReport, resetAnalyticsReport } from '../services/analyticsStore.js';

const router = express.Router();
router.use(requireAuth, requireAdmin);

const adminWriteLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 90,
  keyFn: (req) => req.user?.uid || req.ip,
});

function isPrivilegedUserDoc(data = {}) {
  return Boolean(data.isAdmin || isOwnerEmail(data.email) || data.role === 'admin' || data.role === 'owner');
}

const ALLOWED_CATEGORIES = new Set(['minecraft', 'web', 'discord', 'altyapi']);

// 1. Live Admin Overview (Host + Totals + Per-Server + Billing Breakdown + Alerts)
router.get('/overview', async (req, res) => {
  try {
    const [usersSnap, ticketsSnap, txSnap, pkgSnap, couponsSnap, invitesSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('tickets').get(),
      db.collection('wallet_transactions').get(),
      db.collection('packages').get(),
      db.collection('coupons').get(),
      db.collection('invites').get(),
    ]);

    const telemetry = getLatestTelemetry();
    const users = usersSnap.docs.map((d) => d.data());
    const tickets = ticketsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const txs = txSnap.docs.map((d) => d.data());

    const openTickets = tickets.filter((t) => t.status !== 'closed').length;
    const bannedUsers = users.filter((u) => u.banned).length;
    const totalBalance = users.reduce((s, u) => s + Number(u.balance || 0), 0);
    const totalSpent = users.reduce((s, u) => s + Number(u.totalSpent || 0), 0);

    res.json({
      telemetry,
      summary: {
        totalUsers: users.length,
        bannedUsers,
        adminCount: users.filter((u) => u.isAdmin || isOwnerEmail(u.email)).length,
        openTickets,
        totalTickets: tickets.length,
        totalPackages: pkgSnap.size,
        activeCoupons: couponsSnap.docs.filter((d) => d.data().active).length,
        totalInvites: invitesSnap.size,
        totalUserBalance: Number(totalBalance.toFixed(2)),
        totalPlatformRevenue: Number(totalSpent.toFixed(2)),
        recentTransactionsCount: txs.length,
      },
    });
  } catch {
    res.status(500).json({ error: 'Yönetici özeti yüklenemedi' });
  }
});

// 2. Users Management
router.get('/users', async (req, res) => {
  try {
    const [usersSnap, serversSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('servers').get(),
    ]);

    const srvCountByUid = {};
    for (const s of serversSnap.docs) {
      const uid = s.data().ownerUid;
      srvCountByUid[uid] = (srvCountByUid[uid] || 0) + 1;
    }

    const users = usersSnap.docs
      .map((d) => ({
        ...d.data(),
        uid: d.id,
        serverCount: srvCountByUid[d.id] || 0,
        isOwner: isOwnerEmail(d.data().email),
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ users });
  } catch {
    res.status(500).json({ error: 'Kullanıcı listesi alınamadı' });
  }
});

// 3. Balance Management (Admin adds/deducts/sets user balance)
router.post('/users/:uid/balance', adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const mode = ['add', 'subtract', 'set'].includes(req.body?.mode) ? req.body.mode : 'add';
    const num = parseFiniteNumber(req.body?.amount, { min: 0, max: 1_000_000, label: 'Tutar' });
    const note = sanitizeString(req.body?.note || 'Admin bakiye işlemi', { minLen: 1, maxLen: 160 }) || 'Admin Bakiye Düzenlemesi';

    const userRef = db.collection('users').doc(uid);
    let nextBalance = 0;
    let delta = 0;
    let targetEmail = '';

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists) throw new Error('Kullanıcı bulunamadı');
      const u = snap.data();
      if (!req.user.isOwner && uid !== req.user.uid && isPrivilegedUserDoc(u)) {
        throw new Error('Yalnızca kurucu yönetici diğer yetkililerin bakiyesini düzenleyebilir');
      }
      targetEmail = u.email;
      const curr = Number(u.balance || 0);

      if (mode === 'set') {
        nextBalance = Number(num.toFixed(2));
        delta = Number((nextBalance - curr).toFixed(2));
      } else if (mode === 'subtract') {
        nextBalance = Math.max(0, Number((curr - num).toFixed(2)));
        delta = Number((nextBalance - curr).toFixed(2));
      } else {
        nextBalance = Number((curr + num).toFixed(2));
        delta = Number(num.toFixed(2));
      }

      tx.update(userRef, { balance: nextBalance });
      tx.set(db.collection('wallet_transactions').doc(), {
        uid,
        email: targetEmail,
        type: delta >= 0 ? 'admin_credit' : 'admin_debit',
        amount: delta,
        note,
        adminEmail: req.user.email,
        createdAt: Date.now(),
      });
    });

    await pushUserNotification({
      uid,
      title: '💰 Bakiye Güncellendi',
      message: `${delta >= 0 ? '+' : ''}${delta} İnvite (${note}). Yeni bakiyeniz: ${nextBalance} İnvite`,
      type: 'wallet',
      createdBy: req.user.email,
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'BALANCE_UPDATED',
      targetType: 'user',
      targetId: uid,
      details: { targetEmail, mode, delta, nextBalance, note },
    });

    res.json({ ok: true, balance: nextBalance, delta });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. User Ban / Unban
router.post('/users/:uid/ban', adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    if (uid === req.user.uid) {
      return res.status(400).json({ error: 'Kendi hesabınızı yasaklayamazsınız' });
    }
    const banned = req.body?.banned !== false;
    const reason = sanitizeString(req.body?.reason || 'Yönetici kararı', { maxLen: 240 }) || 'Yönetici kararı';
    const hours = req.body?.hours ? parseFiniteNumber(req.body.hours, { min: 0, max: 87600, label: 'Yasak süresi (saat)' }) : 0;

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const target = snap.data();

    if (isOwnerEmail(target.email)) {
      return res.status(403).json({ error: 'Kurucu yönetici hesabı yasaklanamaz!' });
    }
    if (!req.user.isOwner && isPrivilegedUserDoc(target)) {
      return res.status(403).json({ error: 'Alt yöneticiler başka yöneticileri yasaklayamaz' });
    }

    const bannedUntil = banned && hours > 0 ? Date.now() + hours * 3600 * 1000 : null;
    await userRef.update({
      banned,
      banReason: banned ? reason : '',
      bannedUntil,
    });

    await auth.updateUser(uid, { disabled: banned }).catch(() => {});
    if (banned) {
      await auth.revokeRefreshTokens(uid).catch(() => {});
    }

    // Stop user's active servers when banned
    if (banned) {
      const srvSnap = await db.collection('servers').where('ownerUid', '==', uid).get();
      for (const s of srvSnap.docs) {
        await stopServer(s.id, { pause: true }).catch(() => {});
      }
      sendDiscordWebhook({
        title: 'Kullanıcı Yasaklandı',
        description: `**${target.email}** yasaklandı. Sebep: ${reason}`,
        color: 0xef4444,
      });
    }

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: banned ? 'USER_BANNED' : 'USER_UNBANNED',
      targetType: 'user',
      targetId: uid,
      details: { email: target.email, reason, hours },
    });

    res.json({ ok: true, banned });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Add / Remove Admin (Owner-Only!)
router.post('/users/:uid/admin', requireOwnerAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const isAdmin = Boolean(req.body?.isAdmin);
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    const target = snap.data();

    if (isOwnerEmail(target.email) && !isAdmin) {
      return res.status(400).json({ error: 'Kurucu yönetici yetkisi kaldırılamaz' });
    }

    await userRef.update({
      isAdmin,
      role: isAdmin ? 'admin' : 'user',
    });

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: isAdmin ? 'ADMIN_GRANTED' : 'ADMIN_REVOKED',
      targetType: 'user',
      targetId: uid,
      details: { email: target.email },
    });

    res.json({ ok: true, isAdmin });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. User Badges & XP & Internal Note
router.post('/users/:uid/badges', adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const xpDelta = parseFiniteNumber(req.body?.xpDelta ?? 0, {
      min: -1_000_000,
      max: 1_000_000,
      integer: true,
      label: 'XP değişimi',
    });
    const rawBadges = Array.isArray(req.body?.badges) ? req.body.badges : [];
    const badges = rawBadges
      .slice(0, 25)
      .map((b) => sanitizeString(b, { minLen: 1, maxLen: 50 }))
      .filter(Boolean);

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (!req.user.isOwner && uid !== req.user.uid && isPrivilegedUserDoc(snap.data())) {
      return res.status(403).json({ error: 'Diğer yöneticilerin rozet ve XP verilerini yalnızca kurucu düzenleyebilir' });
    }
    const nextXp = Math.max(0, Number(snap.data().xp || 0) + xpDelta);
    await userRef.update({ badges, xp: nextXp });
    invalidateBootstrapCache();
    res.json({ ok: true, badges, xp: nextXp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:uid/note', adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    if (!req.user.isOwner && isOwnerEmail(snap.data().email)) {
      return res.status(403).json({ error: 'Kurucu hesabı üzerinde not güncellenemez' });
    }
    const notes = sanitizeString(req.body?.notes || '', { maxLen: 2000, allowNewlines: true }) || '';
    await userRef.update({ notes });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/users/:uid/reset-link', requireOwnerAdmin, adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return res.status(404).json({ error: 'Kullanıcı yok' });
    const link = await auth.generatePasswordResetLink(snap.data().email);
    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'PASSWORD_RESET_LINK_GENERATED',
      targetType: 'user',
      targetId: uid,
    });
    res.json({ ok: true, link });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. All Servers & Live Resource Usage
router.get('/servers', async (req, res) => {
  try {
    const snap = await db.collection('servers').get();
    const telemetry = getLatestTelemetry();
    const servers = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
        live: telemetry.perServer[d.id] || {},
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    res.json({ servers, totals: telemetry.totals, alerts: telemetry.alerts });
  } catch {
    res.status(500).json({ error: 'Sunucu listesi yüklenemedi' });
  }
});

// 8. Adjust Server Resources (RAM / CPU / Disk / Slots / Backups)
router.patch('/servers/:id/resources', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sunucu kimliği');
    const { allocatedRamMb, allocatedCpuPct, allocatedDiskMb, slotsOrPorts, backupsLimit } = req.body || {};
    const srvRef = db.collection('servers').doc(id);
    const snap = await srvRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Sunucu bulunamadı' });

    const updates = {
      ...(allocatedRamMb !== undefined
        ? { allocatedRamMb: parseFiniteNumber(allocatedRamMb, { min: 128, max: 131072, integer: true, label: 'RAM (MB)' }) }
        : {}),
      ...(allocatedCpuPct !== undefined
        ? { allocatedCpuPct: parseFiniteNumber(allocatedCpuPct, { min: 25, max: 3200, integer: true, label: 'CPU (%)' }) }
        : {}),
      ...(allocatedDiskMb !== undefined
        ? { allocatedDiskMb: parseFiniteNumber(allocatedDiskMb, { min: 256, max: 1048576, integer: true, label: 'Disk (MB)' }) }
        : {}),
      ...(slotsOrPorts !== undefined
        ? { slotsOrPorts: parseFiniteNumber(slotsOrPorts, { min: 1, max: 10000, integer: true, label: 'Slot/Port' }) }
        : {}),
      ...(backupsLimit !== undefined
        ? { backupsLimit: parseFiniteNumber(backupsLimit, { min: 0, max: 100, integer: true, label: 'Yedek Limiti' }) }
        : {}),
      updatedAt: Date.now(),
    };

    await srvRef.update(updates);
    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'SERVER_RESOURCES_UPDATED',
      targetType: 'server',
      targetId: id,
      details: updates,
    });

    res.json({ ok: true, updates });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Admin Power Control (Start / Stop / Pause / Restart / Kill / Suspend / Unsuspend)
router.post('/servers/:id/power', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sunucu kimliği');
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (action === 'start') await startServer(id, req.user.email);
    else if (action === 'stop') await stopServer(id, { pause: false });
    else if (action === 'pause') await stopServer(id, { pause: true });
    else if (action === 'restart') await restartServer(id, req.user.email);
    else if (action === 'kill') await stopServer(id, { forceKill: true });
    else if (action === 'suspend') {
      const reason = sanitizeString(req.body?.reason || 'Admin askısı', { maxLen: 200 }) || 'Admin askısı';
      await stopServer(id, { forceKill: true });
      await db.collection('servers').doc(id).update({ status: 'suspended', suspendedReason: reason, updatedAt: Date.now() });
    } else if (action === 'unsuspend') {
      await db.collection('servers').doc(id).update({ status: 'stopped', suspendedReason: null, updatedAt: Date.now() });
    } else {
      return res.status(400).json({ error: 'Geçersiz eylem' });
    }

    const srvSnap = await db.collection('servers').doc(id).get();
    const srvData = srvSnap.exists ? srvSnap.data() : null;
    if (srvData?.ownerUid) {
      const actionLabels = {
        start: 'Başlatıldı',
        stop: 'Durduruldu',
        pause: 'Duraklatıldı',
        restart: 'Yeniden Başlatıldı',
        kill: 'Zorla Kapatıldı',
        suspend: 'Askıya Alındı',
        unsuspend: 'Askısı Kaldırıldı',
      };
      await pushUserNotification({
        uid: srvData.ownerUid,
        title: `Sunucu ${actionLabels[action] || action}: ${srvData.name}`,
        message: `Yönetici işlemi (${actionLabels[action] || action}) ${srvData.domainAddress || srvData.slug} sunucunuza uygulandı.`,
        type: 'server_power',
        createdBy: req.user.email,
      });
    }

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: `SERVER_ADMIN_${action.toUpperCase()}`,
      targetType: 'server',
      targetId: id,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Extend Server Expiry & Transfer Server Owner & Delete Server
router.post('/servers/:id/extend', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sunucu kimliği');
    const days = parseFiniteNumber(req.body?.days ?? 30, { min: 1, max: 3650, integer: true, label: 'Gün sayısı' });
    const ref = db.collection('servers').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: 'Sunucu bulunamadı' });
    const base = Math.max(Date.now(), Number(snap.data().expiresAt || Date.now()));
    const nextExp = base + days * 86400 * 1000;
    await ref.update({ expiresAt: nextExp, status: snap.data().status === 'suspended' ? 'stopped' : snap.data().status });
    await writeAuditLog({ actorEmail: req.user.email, action: 'SERVER_EXTENDED', targetType: 'server', targetId: id, details: { days } });
    res.json({ ok: true, expiresAt: nextExp });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/servers/:id/transfer', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sunucu kimliği');
    const targetEmail = String(req.body?.targetEmail || '').toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      return res.status(400).json({ error: 'Geçerli bir hedef e-posta adresi girin' });
    }
    const uSnap = await db.collection('users').where('email', '==', targetEmail).limit(1).get();
    if (uSnap.empty) return res.status(404).json({ error: 'Hedef kullanıcı bulunamadı' });
    const targetUser = uSnap.docs[0];
    if (targetUser.data()?.banned) {
      return res.status(400).json({ error: 'Yasaklı kullanıcıya sunucu transfer edilemez' });
    }
    await db.collection('servers').doc(id).update({
      ownerUid: targetUser.id,
      ownerEmail: targetEmail,
      collaborators: [],
      collaboratorUids: [],
      updatedAt: Date.now(),
    });
    await writeAuditLog({ actorEmail: req.user.email, action: 'SERVER_TRANSFERRED', targetType: 'server', targetId: id, details: { targetEmail } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/servers/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sunucu kimliği');
    const snap = await db.collection('servers').doc(id).get();
    if (!snap.exists) return res.status(404).json({ error: 'Sunucu bulunamadı' });
    await deleteServerWorkspace({ id: snap.id, ...snap.data() });
    await db.collection('servers').doc(id).delete();
    await writeAuditLog({ actorEmail: req.user.email, action: 'SERVER_DELETED', targetType: 'server', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 11. Bulk Server Controls (Pause All / Stop Expired / Panic Stop)
router.post('/servers/bulk', adminWriteLimiter, async (req, res) => {
  try {
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!['pause_all', 'stop_all', 'panic_stop', 'stop_expired'].includes(action)) {
      return res.status(400).json({ error: 'Geçersiz toplu sunucu eylemi' });
    }
    if (action === 'panic_stop' && !req.user.isOwner) {
      return res.status(403).json({ error: 'Acil Durum Tümünü Durdurma yalnızca kurucuya açıktır' });
    }
    const snap = await db.collection('servers').get();
    let affected = 0;
    const now = Date.now();
    for (const doc of snap.docs) {
      const s = doc.data();
      if (action === 'pause_all' && s.status === 'running') {
        await stopServer(doc.id, { pause: true }).catch(() => {});
        affected++;
      } else if ((action === 'stop_all' || action === 'panic_stop') && (s.status === 'running' || activeProcesses.has(doc.id))) {
        await stopServer(doc.id, { forceKill: action === 'panic_stop' }).catch(() => {});
        affected++;
      } else if (action === 'stop_expired' && s.expiresAt && now > s.expiresAt) {
        await stopServer(doc.id, { forceKill: true }).catch(() => {});
        await db.collection('servers').doc(doc.id).update({ status: 'suspended', suspendedReason: 'Süresi doldu' });
        affected++;
      }
    }
    await writeAuditLog({ actorEmail: req.user.email, action: `BULK_${action.toUpperCase()}`, targetType: 'servers', details: { affected } });
    res.json({ ok: true, affected });
  } catch {
    res.status(500).json({ error: 'Toplu sunucu eylemi tamamlanamadı' });
  }
});

// 12. Packages CRUD (Add / Remove / Pause / Price Adjust)
router.get('/packages', async (req, res) => {
  const snap = await db.collection('packages').get();
  const packages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99));
  res.json({ packages });
});

router.post('/packages', adminWriteLimiter, async (req, res) => {
  try {
    const data = req.body || {};
    const category = ALLOWED_CATEGORIES.has(data.category) ? data.category : 'minecraft';
    const id = assertSafeDocId(
      String(data.id || `${category}-${Date.now().toString(36)}`).toLowerCase().replace(/[^a-z0-9_-]/g, ''),
      'paket kimliği'
    );
    const pkg = {
      category,
      name: sanitizeString(data.name || 'Yeni Paket', { minLen: 1, maxLen: 80 }) || 'Yeni Paket',
      description: sanitizeString(data.description || '', { maxLen: 500 }) || '',
      priceDaily: parseFiniteNumber(data.priceDaily ?? 5, { min: 0, max: 100000, label: 'Günlük fiyat' }),
      priceWeekly: parseFiniteNumber(data.priceWeekly ?? 30, { min: 0, max: 500000, label: 'Haftalık fiyat' }),
      priceMonthly: parseFiniteNumber(data.priceMonthly ?? 99, { min: 0, max: 1000000, label: 'Aylık fiyat' }),
      ramMb: parseFiniteNumber(data.ramMb ?? 2048, { min: 128, max: 131072, integer: true, label: 'RAM (MB)' }),
      cpuCores: parseFiniteNumber(data.cpuCores ?? 2, { min: 1, max: 64, label: 'CPU çekirdek' }),
      cpuLimitPct: parseFiniteNumber(data.cpuLimitPct ?? 200, { min: 25, max: 3200, integer: true, label: 'CPU limiti' }),
      diskMb: parseFiniteNumber(data.diskMb ?? 10240, { min: 256, max: 1048576, integer: true, label: 'Disk (MB)' }),
      slotsOrPorts: parseFiniteNumber(data.slotsOrPorts ?? 20, { min: 1, max: 10000, integer: true, label: 'Slot/Port' }),
      bandwidthGb: parseFiniteNumber(data.bandwidthGb ?? 1000, { min: 1, max: 1000000, integer: true, label: 'Bant genişliği' }),
      backupsLimit: parseFiniteNumber(data.backupsLimit ?? 3, { min: 0, max: 100, integer: true, label: 'Yedek limiti' }),
      badge: sanitizeString(data.badge || '', { maxLen: 40 }) || '',
      featured: Boolean(data.featured),
      active: data.active !== false,
      paused: Boolean(data.paused),
      sortOrder: parseFiniteNumber(data.sortOrder ?? 50, { min: 0, max: 10000, integer: true, label: 'Sıralama' }),
      salesCount: 0,
      createdAt: Date.now(),
    };
    await db.collection('packages').doc(id).set(pkg);
    invalidateBootstrapCache();
    await writeAuditLog({ actorEmail: req.user.email, action: 'PACKAGE_CREATED', targetType: 'package', targetId: id, details: pkg });
    res.status(201).json({ ok: true, id, package: pkg });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/packages/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'paket kimliği');
    const data = req.body || {};
    const updates = { updatedAt: Date.now() };
    if (data.category !== undefined) {
      if (!ALLOWED_CATEGORIES.has(data.category)) throw new Error('Geçersiz kategori');
      updates.category = data.category;
    }
    if (data.name !== undefined) updates.name = sanitizeString(data.name, { minLen: 1, maxLen: 80 }) || 'Paket';
    if (data.description !== undefined) updates.description = sanitizeString(data.description, { maxLen: 500 }) || '';
    if (data.badge !== undefined) updates.badge = sanitizeString(data.badge, { maxLen: 40 }) || '';
    if (data.priceDaily !== undefined) updates.priceDaily = parseFiniteNumber(data.priceDaily, { min: 0, max: 100000, label: 'Günlük fiyat' });
    if (data.priceWeekly !== undefined) updates.priceWeekly = parseFiniteNumber(data.priceWeekly, { min: 0, max: 500000, label: 'Haftalık fiyat' });
    if (data.priceMonthly !== undefined) updates.priceMonthly = parseFiniteNumber(data.priceMonthly, { min: 0, max: 1000000, label: 'Aylık fiyat' });
    if (data.ramMb !== undefined) updates.ramMb = parseFiniteNumber(data.ramMb, { min: 128, max: 131072, integer: true, label: 'RAM (MB)' });
    if (data.cpuCores !== undefined) updates.cpuCores = parseFiniteNumber(data.cpuCores, { min: 1, max: 64, label: 'CPU çekirdek' });
    if (data.cpuLimitPct !== undefined) updates.cpuLimitPct = parseFiniteNumber(data.cpuLimitPct, { min: 25, max: 3200, integer: true, label: 'CPU limiti' });
    if (data.diskMb !== undefined) updates.diskMb = parseFiniteNumber(data.diskMb, { min: 256, max: 1048576, integer: true, label: 'Disk (MB)' });
    if (data.slotsOrPorts !== undefined) updates.slotsOrPorts = parseFiniteNumber(data.slotsOrPorts, { min: 1, max: 10000, integer: true, label: 'Slot/Port' });
    if (data.bandwidthGb !== undefined) updates.bandwidthGb = parseFiniteNumber(data.bandwidthGb, { min: 1, max: 1000000, integer: true, label: 'Bant genişliği' });
    if (data.backupsLimit !== undefined) updates.backupsLimit = parseFiniteNumber(data.backupsLimit, { min: 0, max: 100, integer: true, label: 'Yedek limiti' });
    if (data.sortOrder !== undefined) updates.sortOrder = parseFiniteNumber(data.sortOrder, { min: 0, max: 10000, integer: true, label: 'Sıralama' });
    if (data.featured !== undefined) updates.featured = Boolean(data.featured);
    if (data.active !== undefined) updates.active = Boolean(data.active);
    if (data.paused !== undefined) updates.paused = Boolean(data.paused);

    await db.collection('packages').doc(id).update(updates);
    invalidateBootstrapCache();
    await writeAuditLog({ actorEmail: req.user.email, action: 'PACKAGE_UPDATED', targetType: 'package', targetId: id, details: updates });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/packages/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'paket kimliği');
    await db.collection('packages').doc(id).delete();
    invalidateBootstrapCache();
    await writeAuditLog({ actorEmail: req.user.email, action: 'PACKAGE_DELETED', targetType: 'package', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 13. Coupons System
router.get('/coupons', async (req, res) => {
  const snap = await db.collection('coupons').get();
  res.json({ coupons: snap.docs.map((d) => ({ code: d.id, ...d.data() })) });
});

router.post('/coupons', adminWriteLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    if (!code || code.length > 40) return res.status(400).json({ error: 'Kupon kodu geçersiz' });
    const discountType = req.body?.discountType === 'fixed' ? 'fixed' : 'percent';
    const maxVal = discountType === 'percent' ? 100 : 100000;
    const categoryFilter =
      req.body?.categoryFilter === 'all' || ALLOWED_CATEGORIES.has(req.body?.categoryFilter)
        ? req.body.categoryFilter
        : 'all';
    const coupon = {
      code,
      discountType,
      value: parseFiniteNumber(req.body?.value ?? 10, { min: 0, max: maxVal, label: 'İndirim değeri' }),
      minAmount: parseFiniteNumber(req.body?.minAmount ?? 0, { min: 0, max: 1000000, label: 'Minimum tutar' }),
      maxUses: parseFiniteNumber(req.body?.maxUses ?? 100, { min: 1, max: 1000000, integer: true, label: 'Maksimum kullanım' }),
      usedCount: 0,
      categoryFilter,
      active: req.body?.active !== false,
      expiresAt: req.body?.expiresAt
        ? parseFiniteNumber(req.body.expiresAt, { min: 0, max: 9999999999999, label: 'Son kullanma' })
        : Date.now() + 30 * 86400 * 1000,
      createdBy: req.user.email,
      createdAt: Date.now(),
    };
    await db.collection('coupons').doc(code).set(coupon);
    await writeAuditLog({ actorEmail: req.user.email, action: 'COUPON_CREATED', targetType: 'coupon', targetId: code });
    res.status(201).json({ ok: true, coupon });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/coupons/:code', adminWriteLimiter, async (req, res) => {
  try {
    const code = assertSafeDocId(req.params.code, 'kupon kodu', { maxLen: 40 });
    const data = req.body || {};
    const updates = {};
    if (data.active !== undefined) updates.active = Boolean(data.active);
    if (data.discountType !== undefined) updates.discountType = data.discountType === 'fixed' ? 'fixed' : 'percent';
    if (data.value !== undefined) updates.value = parseFiniteNumber(data.value, { min: 0, max: 100000, label: 'İndirim değeri' });
    if (data.minAmount !== undefined) updates.minAmount = parseFiniteNumber(data.minAmount, { min: 0, max: 1000000, label: 'Minimum tutar' });
    if (data.maxUses !== undefined) updates.maxUses = parseFiniteNumber(data.maxUses, { min: 1, max: 1000000, integer: true, label: 'Maksimum kullanım' });
    if (data.categoryFilter !== undefined) {
      updates.categoryFilter =
        data.categoryFilter === 'all' || ALLOWED_CATEGORIES.has(data.categoryFilter) ? data.categoryFilter : 'all';
    }
    if (data.expiresAt !== undefined) {
      updates.expiresAt = parseFiniteNumber(data.expiresAt, { min: 0, max: 9999999999999, label: 'Son kullanma' });
    }
    await db.collection('coupons').doc(code).update(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/coupons/:code', adminWriteLimiter, async (req, res) => {
  try {
    const code = assertSafeDocId(req.params.code, 'kupon kodu', { maxLen: 40 });
    await db.collection('coupons').doc(code).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 14. Invites & Leaderboard Reward
router.get('/invites', async (req, res) => {
  const snap = await db.collection('invites').orderBy('createdAt', 'desc').limit(100).get();
  res.json({ invites: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/leaderboard/reward', adminWriteLimiter, async (req, res) => {
  try {
    const uid = assertSafeDocId(req.body?.uid, 'kullanıcı kimliği');
    const bonusBalance = parseFiniteNumber(req.body?.bonusBalance ?? 50, { min: 0, max: 100000, label: 'Ödül tutarı' });
    const badge = sanitizeString(req.body?.badge || 'Liderlik Ödülü', { minLen: 1, maxLen: 50 }) || 'Liderlik Ödülü';
    const uRef = db.collection('users').doc(uid);

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(uRef);
      if (!snap.exists) throw new Error('Kullanıcı bulunamadı');
      const u = snap.data();
      const badges = Array.from(new Set([...(Array.isArray(u.badges) ? u.badges : []), badge])).slice(0, 25);
      tx.update(uRef, {
        balance: Number((Number(u.balance || 0) + bonusBalance).toFixed(2)),
        badges,
      });
      tx.set(db.collection('wallet_transactions').doc(), {
        uid,
        email: u.email,
        type: 'invite_reward',
        amount: bonusBalance,
        note: `Liderlik Tablosu Ödülü (${badge})`,
        adminEmail: req.user.email,
        createdAt: Date.now(),
      });
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 15. Global System Config (Maintenance, Discord Link, Flash Sale, Limits, Webhook, Branding, SEO, Secrets)
router.get('/config', async (req, res) => {
  const [snap, secretSnap] = await Promise.all([
    db.collection('system_config').doc('global').get(),
    db.collection('system_config').doc('secrets').get(),
  ]);
  const secData = secretSnap.exists ? secretSnap.data() : {};
  res.json({
    config: {
      ...(snap.exists ? snap.data() : {}),
      discordWebhookUrl: secData?.discordWebhookUrl || '',
      curseforgeApiKey: secData?.curseforgeApiKey || '',
    },
  });
});

router.patch('/config', adminWriteLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if (body.onlyOwnerAdminMode !== undefined && !req.user.isOwner) {
      return res.status(403).json({ error: 'Yalnızca kurucu admin kilidini değiştirebilir' });
    }
    const { discordWebhookUrl, curseforgeApiKey, ...rest } = body;
    if (discordWebhookUrl !== undefined && !isSafeDiscordWebhookUrl(discordWebhookUrl)) {
      return res.status(400).json({ error: 'Discord Webhook adresi yalnızca https://discord.com/api/webhooks/... olmalıdır' });
    }
    if (rest.discordInviteUrl !== undefined && !isSafeHttpUrl(rest.discordInviteUrl, { allowEmpty: true })) {
      return res.status(400).json({ error: 'Geçersiz Discord davet URL adresi' });
    }

    const sanitizedRest = {};
    for (const [k, v] of Object.entries(rest).slice(0, 60)) {
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(k) || k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (typeof v === 'boolean' || v === null) {
        sanitizedRest[k] = v;
      } else if (typeof v === 'number') {
        sanitizedRest[k] = Number.isFinite(v) ? v : 0;
      } else if (typeof v === 'string') {
        sanitizedRest[k] = v.replace(/\0/g, '').slice(0, 12000);
      }
    }

    if (sanitizedRest.flashSalePercent !== undefined) {
      sanitizedRest.flashSalePercent = parseFiniteNumber(sanitizedRest.flashSalePercent, { min: 0, max: 90, label: 'Flash İndirim (%)' });
    }
    if (sanitizedRest.maxServersPerUser !== undefined) {
      sanitizedRest.maxServersPerUser = parseFiniteNumber(sanitizedRest.maxServersPerUser, { min: 1, max: 100, integer: true, label: 'Maks Sunucu' });
    }
    if (sanitizedRest.maxUploadMb !== undefined) {
      sanitizedRest.maxUploadMb = parseFiniteNumber(sanitizedRest.maxUploadMb, { min: 1, max: 500, integer: true, label: 'Maks Yükleme (MB)' });
    }
    if (sanitizedRest.nightMarketCooldownDays !== undefined) {
      sanitizedRest.nightMarketCooldownDays = parseFiniteNumber(sanitizedRest.nightMarketCooldownDays, { min: 1, max: 90, integer: true, label: 'Gece Pazarı Döngüsü' });
    }
    if (sanitizedRest.nightMarketBoxCount !== undefined) {
      sanitizedRest.nightMarketBoxCount = parseFiniteNumber(sanitizedRest.nightMarketBoxCount, { min: 1, max: 6, integer: true, label: 'Gece Pazarı Kutu Sayısı' });
    }

    const updates = { ...sanitizedRest, updatedAt: Date.now(), updatedBy: req.user.email };
    await db.collection('system_config').doc('global').set(updates, { merge: true });
    if (discordWebhookUrl !== undefined || curseforgeApiKey !== undefined) {
      const secretUpdates = { updatedAt: Date.now() };
      if (discordWebhookUrl !== undefined) secretUpdates.discordWebhookUrl = String(discordWebhookUrl || '').trim();
      if (curseforgeApiKey !== undefined) secretUpdates.curseforgeApiKey = String(curseforgeApiKey || '').trim().slice(0, 300);
      await db.collection('system_config').doc('secrets').set(secretUpdates, { merge: true });
    }
    invalidateBootstrapCache();
    await writeAuditLog({ actorEmail: req.user.email, action: 'SYSTEM_CONFIG_UPDATED', targetType: 'config', details: Object.keys(sanitizedRest) });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/webhook/test', adminWriteLimiter, async (req, res) => {
  const result = await sendDiscordWebhook({
    title: 'EmoçHosting Webhook Testi Başarılı!',
    description: `${req.user.email} tarafından gönderilen test bildirimi.`,
    color: 0xf59e0b,
  });
  res.json(result);
});

// 15b. Giveaways Management
router.get('/giveaways', async (req, res) => {
  const snap = await db.collection('giveaways').orderBy('createdAt', 'desc').limit(50).get();
  res.json({ giveaways: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/giveaways', adminWriteLimiter, async (req, res) => {
  try {
    const {
      title,
      description = '',
      prizeType = 'balance',
      prizeValue = 100,
      prizeLabel = '',
      winnerCount = 1,
      durationHours = 48,
      minXp = 0,
    } = req.body || {};
    const cleanTitle = sanitizeString(title, { minLen: 2, maxLen: 120 });
    if (!cleanTitle) return res.status(400).json({ error: 'Çekiliş başlığı zorunludur' });
    const safePrizeType = prizeType === 'coupon' ? 'coupon' : 'balance';
    const safePrizeVal = parseFiniteNumber(prizeValue, {
      min: 1,
      max: safePrizeType === 'coupon' ? 100 : 100000,
      label: 'Ödül değeri',
    });
    const safeWinnerCount = parseFiniteNumber(winnerCount, { min: 1, max: 50, integer: true, label: 'Kazanan sayısı' });
    const safeMinXp = parseFiniteNumber(minXp, { min: 0, max: 10_000_000, integer: true, label: 'Minimum XP' });
    const safeHours = parseFiniteNumber(durationHours, { min: 1, max: 720, label: 'Süre (saat)' });

    const now = Date.now();
    const endsAt = req.body?.endsAt
      ? parseFiniteNumber(req.body.endsAt, { min: now, max: now + 365 * 86400 * 1000, label: 'Bitiş zamanı' })
      : now + safeHours * 60 * 60 * 1000;
    const cleanPrizeLabel =
      sanitizeString(prizeLabel, { maxLen: 80 }) ||
      (safePrizeType === 'balance' ? `${safePrizeVal} İnvite Bakiye` : `%${safePrizeVal} Kupon`);

    const doc = await db.collection('giveaways').add({
      title: cleanTitle,
      description: sanitizeString(description, { maxLen: 600, allowNewlines: true }) || '',
      prizeType: safePrizeType,
      prizeValue: safePrizeVal,
      prizeLabel: cleanPrizeLabel,
      winnerCount: safeWinnerCount,
      minXp: safeMinXp,
      participantCount: 0,
      status: 'active',
      winners: [],
      endsAt,
      createdBy: req.user.email,
      createdAt: now,
    });
    await writeAuditLog({ actorEmail: req.user.email, action: 'GIVEAWAY_CREATED', targetType: 'giveaway', targetId: doc.id, details: { title: cleanTitle } });
    await pushUserNotification({
      uid: 'all',
      title: '🎁 Yeni Çekiliş Başladı!',
      message: `"${cleanTitle}" çekilişi açıldı! Ödül: ${cleanPrizeLabel}. Çekilişler sayfasından katılabilirsiniz.`,
      type: 'giveaway_new',
      createdBy: req.user.email,
    });
    res.status(201).json({ ok: true, id: doc.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/giveaways/:id/draw', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'çekiliş kimliği');
    const result = await drawGiveawayWinners(id, req.user.email);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/giveaways/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'çekiliş kimliği');
    await db.collection('giveaways').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 16. Tickets & Canned Responses
router.get('/tickets', async (req, res) => {
  const snap = await db.collection('tickets').orderBy('updatedAt', 'desc').get();
  res.json({ tickets: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.patch('/tickets/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'talep kimliği');
    const body = req.body || {};
    const updates = { updatedAt: Date.now() };
    if (body.status !== undefined) {
      const st = String(body.status).trim().toLowerCase();
      if (!['open', 'answered', 'closed'].includes(st)) {
        return res.status(400).json({ error: 'Geçersiz talep durumu' });
      }
      updates.status = st;
    }
    if (body.priority !== undefined) {
      const pr = String(body.priority).trim().toLowerCase();
      if (['low', 'normal', 'high', 'urgent', 'dusuk', 'yuksek', 'acil'].includes(pr)) {
        updates.priority = pr;
      }
    }
    if (body.assignedTo !== undefined) {
      updates.assignedTo = body.assignedTo ? sanitizeString(body.assignedTo, { maxLen: 120 }) : null;
    }

    const ref = db.collection('tickets').doc(id);
    await ref.update(updates);
    if (body.internalNote !== undefined) {
      await ref.collection('internal_notes').doc('admin').set({
        text: sanitizeString(body.internalNote, { maxLen: 2000, allowNewlines: true }) || '',
        updatedAt: Date.now(),
      });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/canned-responses', async (req, res) => {
  const snap = await db.collection('canned_responses').get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/canned-responses', adminWriteLimiter, async (req, res) => {
  const title = sanitizeString(req.body?.title || 'Şablon', { maxLen: 80 }) || 'Şablon';
  const text = sanitizeString(req.body?.text || '', { maxLen: 4000, allowNewlines: true }) || '';
  const doc = await db.collection('canned_responses').add({
    title,
    text,
    createdAt: Date.now(),
  });
  res.status(201).json({ ok: true, id: doc.id });
});

router.delete('/canned-responses/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'şablon kimliği');
    await db.collection('canned_responses').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 17. Announcements, Incidents, IP Bans, Templates, Audit Logs, Transactions, Broadcast, Global Backups, Export
router.get('/announcements', async (req, res) => {
  const snap = await db.collection('announcements').orderBy('createdAt', 'desc').get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/announcements', adminWriteLimiter, async (req, res) => {
  const doc = await db.collection('announcements').add({
    title: sanitizeString(req.body?.title || '', { maxLen: 120 }) || '',
    message: sanitizeString(req.body?.message || '', { maxLen: 1000, allowNewlines: true }) || '',
    type: ['info', 'warning', 'success', 'danger'].includes(req.body?.type) ? req.body.type : 'info',
    active: true,
    createdBy: req.user.email,
    createdAt: Date.now(),
  });
  invalidateBootstrapCache();
  res.status(201).json({ ok: true, id: doc.id });
});

router.delete('/announcements/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'duyuru kimliği');
    await db.collection('announcements').doc(id).delete();
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/incidents', async (req, res) => {
  const snap = await db.collection('incidents').orderBy('createdAt', 'desc').get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/incidents', adminWriteLimiter, async (req, res) => {
  const doc = await db.collection('incidents').add({
    title: sanitizeString(req.body?.title || '', { maxLen: 120 }) || '',
    message: sanitizeString(req.body?.message || '', { maxLen: 1000, allowNewlines: true }) || '',
    severity: ['degraded', 'partial', 'major', 'maintenance', 'resolved'].includes(req.body?.severity) ? req.body.severity : 'degraded',
    status: ['investigating', 'identified', 'monitoring', 'resolved'].includes(req.body?.status) ? req.body.status : 'investigating',
    createdBy: req.user.email,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  invalidateBootstrapCache();
  res.status(201).json({ ok: true, id: doc.id });
});

router.patch('/incidents/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'olay kimliği');
    const body = req.body || {};
    const updates = { updatedAt: Date.now() };
    if (body.title !== undefined) updates.title = sanitizeString(body.title, { maxLen: 120 }) || '';
    if (body.message !== undefined) updates.message = sanitizeString(body.message, { maxLen: 1000, allowNewlines: true }) || '';
    if (body.severity !== undefined && ['degraded', 'partial', 'major', 'maintenance', 'resolved'].includes(body.severity)) {
      updates.severity = body.severity;
    }
    if (body.status !== undefined && ['investigating', 'identified', 'monitoring', 'resolved'].includes(body.status)) {
      updates.status = body.status;
    }
    await db.collection('incidents').doc(id).update(updates);
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/incidents/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'olay kimliği');
    await db.collection('incidents').doc(id).delete();
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/ip-bans', async (req, res) => {
  const snap = await db.collection('ip_bans').get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/ip-bans', adminWriteLimiter, async (req, res) => {
  const ip = String(req.body?.ip || '').trim();
  if (!isValidIpAddress(ip)) {
    return res.status(400).json({ error: 'Geçerli bir IPv4 veya IPv6 adresi girin' });
  }
  const doc = await db.collection('ip_bans').add({
    ip,
    reason: sanitizeString(req.body?.reason || 'Güvenlik kuralı', { maxLen: 200 }) || 'Güvenlik kuralı',
    createdBy: req.user.email,
    createdAt: Date.now(),
  });
  await writeAuditLog({ actorEmail: req.user.email, action: 'IP_BANNED', targetType: 'ip', targetId: ip });
  res.status(201).json({ ok: true, id: doc.id });
});

router.delete('/ip-bans/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'kayıt kimliği');
    await db.collection('ip_bans').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/templates', async (req, res) => {
  const snap = await db.collection('starter_templates').get();
  res.json({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/templates', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(String(req.body?.id || `tpl-${Date.now().toString(36)}`), 'şablon kimliği');
    await db.collection('starter_templates').doc(id).set({
      category: ALLOWED_CATEGORIES.has(req.body?.category) ? req.body.category : 'web',
      name: sanitizeString(req.body?.name || 'Yeni Şablon', { maxLen: 80 }) || 'Yeni Şablon',
      description: sanitizeString(req.body?.description || '', { maxLen: 400 }) || '',
      active: req.body?.active !== false,
    });
    invalidateBootstrapCache();
    res.json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/templates/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'şablon kimliği');
    await db.collection('starter_templates').doc(id).delete();
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/audit-logs', async (req, res) => {
  const snap = await db.collection('audit_logs').orderBy('createdAt', 'desc').limit(150).get();
  res.json({ logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.get('/transactions', async (req, res) => {
  const snap = await db.collection('wallet_transactions').orderBy('createdAt', 'desc').limit(150).get();
  res.json({ transactions: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/notifications/broadcast', adminWriteLimiter, async (req, res) => {
  try {
    const uidRaw = String(req.body?.uid || 'all').trim();
    const uid = uidRaw === 'all' ? 'all' : assertSafeDocId(uidRaw, 'kullanıcı kimliği');
    const title = sanitizeString(req.body?.title || 'Sistem Bildirimi', { maxLen: 120 }) || 'Sistem Bildirimi';
    const message = sanitizeString(req.body?.message || '', { maxLen: 1000, allowNewlines: true }) || '';
    const type = sanitizeString(req.body?.type || 'info', { maxLen: 32 }) || 'info';
    await pushUserNotification({
      uid,
      title,
      message,
      type,
      createdBy: req.user.email,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/backups', async (req, res) => {
  const result = [];
  let totalSizeMb = 0;
  if (fs.existsSync(BACKUPS_DIR)) {
    for (const srvId of fs.readdirSync(BACKUPS_DIR)) {
      const p = path.join(BACKUPS_DIR, srvId);
      if (!fs.lstatSync(p).isDirectory()) continue;
      for (const file of fs.readdirSync(p).filter((f) => f.endsWith('.zip'))) {
        const st = fs.lstatSync(path.join(p, file));
        if (st.isSymbolicLink()) continue;
        const sizeMb = Number((st.size / (1024 * 1024)).toFixed(2));
        totalSizeMb += sizeMb;
        result.push({ serverId: srvId, filename: file, sizeMb, createdAt: st.mtimeMs });
      }
    }
  }
  res.json({ backups: result.sort((a, b) => b.createdAt - a.createdAt), totalSizeMb: Number(totalSizeMb.toFixed(2)) });
});

router.delete('/backups/:serverId/:filename', adminWriteLimiter, async (req, res) => {
  try {
    const serverId = assertSafeDocId(req.params.serverId, 'sunucu kimliği');
    const filename = assertSafeDocId(req.params.filename, 'yedek dosya adı', { allowDots: true });
    if (!filename.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Geçersiz yedek dosya uzantısı' });
    }
    await deleteServerBackupZip(serverId, filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/maintenance/cleanup', adminWriteLimiter, async (req, res) => {
  const srvSnap = await db.collection('servers').get();
  const validIds = new Set(srvSnap.docs.map((d) => d.id));
  let cleanedFolders = 0;

  for (const cat of ['minecraft', 'web', 'discord', 'altyapi']) {
    const catDir = path.join(INSTANCES_DIR, cat);
    if (!fs.existsSync(catDir)) continue;
    for (const entry of fs.readdirSync(catDir)) {
      if (!validIds.has(entry)) {
        fs.rmSync(path.join(catDir, entry), { recursive: true, force: true });
        cleanedFolders++;
      }
    }
  }
  await writeAuditLog({ actorEmail: req.user.email, action: 'SYSTEM_CLEANUP', targetType: 'system', details: { cleanedFolders } });
  res.json({ ok: true, cleanedFolders, totalInstancesSizeMb: getDirSizeMb(INSTANCES_DIR) });
});

router.get('/export/:type', async (req, res) => {
  const map = {
    users: 'users',
    servers: 'servers',
    transactions: 'wallet_transactions',
    coupons: 'coupons',
    tickets: 'tickets',
    audit_logs: 'audit_logs',
  };
  const col = map[req.params.type];
  if (!col) return res.status(400).json({ error: 'Geçersiz dışa aktarım türü' });
  const snap = await db.collection(col).get();
  const rows = snap.docs.map((d) => {
    const data = d.data();
    if (col === 'servers' && data.sftp) {
      return { id: d.id, ...data, sftp: { ...data.sftp, password: '[MASKED]' } };
    }
    return { id: d.id, ...data };
  });
  res.setHeader('Content-Disposition', `attachment; filename="emochosting-${col}-${Date.now()}.json"`);
  res.json(rows);
});

// 17. Changelogs / Release Notes Management
router.get('/changelogs', async (req, res) => {
  const snap = await db.collection('changelogs').orderBy('createdAt', 'desc').limit(30).get();
  res.json({ changelogs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
});

router.post('/changelogs', adminWriteLimiter, async (req, res) => {
  try {
    const version = sanitizeString(req.body?.version || 'v1.0.0', { minLen: 1, maxLen: 32 }) || 'v1.0.0';
    const title = sanitizeString(req.body?.title || '', { minLen: 1, maxLen: 120 });
    const summary = sanitizeString(req.body?.summary || '', { maxLen: 500 }) || '';
    const items = Array.isArray(req.body?.items)
      ? req.body.items.map((x) => sanitizeString(x, { maxLen: 200 })).filter(Boolean).slice(0, 20)
      : String(req.body?.itemsText || '')
          .split('\n')
          .map((x) => sanitizeString(x, { maxLen: 200 }))
          .filter(Boolean)
          .slice(0, 20);
    const category = ['feature', 'fix', 'security', 'maintenance'].includes(req.body?.category)
      ? req.body.category
      : 'feature';
    const active = req.body?.active !== false;
    if (!title) return res.status(400).json({ error: 'Güncelleme başlığı zorunludur' });

    const now = Date.now();
    const doc = await db.collection('changelogs').add({
      version,
      title,
      summary,
      items,
      category,
      active,
      createdBy: req.user.email,
      createdAt: now,
    });
    if (active && req.body?.notifyAll !== false) {
      await pushUserNotification({
        uid: 'all',
        title: `🚀 Yeni Güncelleme: ${version}`,
        message: `${title}${summary ? ' — ' + summary : ''}`,
        type: 'changelog',
        createdBy: req.user.email,
      });
    }
    invalidateBootstrapCache();
    await writeAuditLog({ actorEmail: req.user.email, action: 'CHANGELOG_CREATED', targetType: 'changelog', targetId: doc.id, details: { version, title } });
    res.status(201).json({ ok: true, id: doc.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/changelogs/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sürüm notu kimliği');
    const body = req.body || {};
    const updates = { updatedAt: Date.now() };
    if (body.version !== undefined) updates.version = sanitizeString(body.version, { minLen: 1, maxLen: 32 }) || 'v1.0.0';
    if (body.title !== undefined) updates.title = sanitizeString(body.title, { minLen: 1, maxLen: 120 }) || '';
    if (body.summary !== undefined) updates.summary = sanitizeString(body.summary, { maxLen: 500 }) || '';
    if (Array.isArray(body.items)) {
      updates.items = body.items.map((x) => sanitizeString(x, { maxLen: 200 })).filter(Boolean).slice(0, 20);
    }
    if (body.category !== undefined && ['feature', 'fix', 'security', 'maintenance'].includes(body.category)) {
      updates.category = body.category;
    }
    if (body.active !== undefined) updates.active = Boolean(body.active);
    await db.collection('changelogs').doc(id).update(updates);
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/changelogs/:id', adminWriteLimiter, async (req, res) => {
  try {
    const id = assertSafeDocId(req.params.id, 'sürüm notu kimliği');
    await db.collection('changelogs').doc(id).delete();
    invalidateBootstrapCache();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 18. Bulk Event Bonus to All Active Users
router.post('/users/bulk-bonus', adminWriteLimiter, async (req, res) => {
  try {
    const balanceBonus = parseFiniteNumber(req.body?.balanceBonus ?? 0, { min: 0, max: 10000, label: 'Bakiye bonusu' });
    const xpBonus = parseFiniteNumber(req.body?.xpBonus ?? 0, { min: 0, max: 100000, integer: true, label: 'XP bonusu' });
    const note = sanitizeString(req.body?.note || 'Admin Toplu Etkinlik Bonusu', { minLen: 1, maxLen: 120 }) || 'Admin Toplu Etkinlik Bonusu';
    if (balanceBonus <= 0 && xpBonus <= 0) {
      return res.status(400).json({ error: 'En az bir bakiye veya XP miktarı girin' });
    }

    const snap = await db.collection('users').get();
    const targets = snap.docs.filter((d) => !d.data().banned);
    const now = Date.now();

    for (const uDoc of targets) {
      const u = uDoc.data();
      const nextBalance = Number((Number(u.balance || 0) + balanceBonus).toFixed(2));
      const nextXp = Number(u.xp || 0) + xpBonus;
      await uDoc.ref.update({ balance: nextBalance, xp: nextXp });
      if (balanceBonus > 0) {
        await db.collection('wallet_transactions').add({
          uid: uDoc.id,
          email: u.email || '',
          type: 'admin_credit',
          amount: balanceBonus,
          note,
          adminEmail: req.user.email,
          createdAt: now,
        });
      }
      await pushUserNotification({
        uid: uDoc.id,
        title: '🎁 Toplu Etkinlik Bonusu!',
        message: `${note}: ${balanceBonus > 0 ? `+${balanceBonus} İnvite ` : ''}${xpBonus > 0 ? `+${xpBonus} XP` : ''} hesabınıza tanımlandı.`,
        type: 'wallet',
        createdBy: req.user.email,
      });
    }

    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'BULK_USER_BONUS',
      targetType: 'users',
      details: { count: targets.length, balanceBonus, xpBonus, note },
    });
    res.json({ ok: true, count: targets.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 19. Live Network & Port Map
router.get('/network-map', async (req, res) => {
  try {
    const srvSnap = await db.collection('servers').get();
    const tel = getLatestTelemetry();
    const nodes = srvSnap.docs.map((d) => {
      const s = d.data();
      const live = tel.perServer?.[d.id] || {};
      return {
        id: d.id,
        name: s.name,
        category: s.category,
        ownerEmail: s.ownerEmail,
        port: s.port,
        subdomain: s.subdomain || s.slug,
        domainAddress: s.domainAddress || `${s.subdomain || s.slug}.${ENV.DOMAIN_SUFFIX}`,
        status: live.status || s.status,
        pid: activeProcesses.get(d.id)?.pid || null,
        cpuPct: live.cpuPct || 0,
        ramUsedMb: live.ramUsedMb || 0,
      };
    });
    res.json({
      proxyPorts: {
        httpApi: ENV.PORT,
        mcSniProxy: ENV.MC_PROXY_PORT,
        sftp: ENV.SFTP_PORT,
        webRange: `${ENV.WEB_PORT_START}-${ENV.WEB_PORT_END}`,
        allocRange: `${ENV.ALLOC_PORT_START}-${ENV.ALLOC_PORT_END}`,
        domainSuffix: ENV.DOMAIN_SUFFIX,
      },
      nodes: nodes.sort((a, b) => Number(a.port || 0) - Number(b.port || 0)),
    });
  } catch {
    res.status(500).json({ error: 'Ağ haritası alınamadı' });
  }
});

// 20. Reset Night Market Boxes for All Users
router.post('/night-market/reset-all', async (req, res) => {
  try {
    const snap = await db.collection('users').get();
    let count = 0;
    for (const d of snap.docs) {
      if (d.data().nightMarket) {
        await d.ref.update({ nightMarket: null });
        count++;
      }
    }
    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'NIGHT_MARKET_RESET_ALL',
      targetType: 'system',
      details: { resetUsers: count },
    });
    res.json({ ok: true, count });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Make sure GET errors don't leak stack internals on network-map or overview


// 21. Cookie Consent & Page Dwell/Interest Analytics
router.get('/analytics', async (req, res) => {
  try {
    const report = await getAnalyticsReport();
    res.json(report);
  } catch {
    res.status(500).json({ error: 'Analitik verileri yüklenemedi' });
  }
});

router.post('/analytics/reset', adminWriteLimiter, async (req, res) => {
  try {
    const report = await resetAnalyticsReport();
    await writeAuditLog({
      actorEmail: req.user.email,
      actorUid: req.user.uid,
      action: 'ANALYTICS_RESET',
      targetType: 'analytics',
    });
    res.json({ ok: true, report });
  } catch {
    res.status(500).json({ error: 'Analitik verileri sıfırlanamadı' });
  }
});

export default router;
