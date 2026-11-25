import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { ENV } from '../config/env.js';
import { db, writeAuditLog, logServerActivity } from '../services/firebase.js';
import { pushUserNotification } from '../services/notifications.js';
import { requireAuth, getSystemConfig } from '../middleware/auth.js';
import {
  activeProcesses,
  getInstanceDir,
  getServerBackupDir,
  resolveSafePath,
  getConsoleHistory,
  clearConsoleHistory,
  getWebLogs,
  startServer,
  stopServer,
  restartServer,
  sendConsoleCommand,
  runServerInstallCommand,
  createServerBackupZip,
  listServerBackups,
  restoreServerBackupZip,
  deleteServerBackupZip,
  parseEnvText,
  serializeEnvObj,
  parsePropertiesText,
  serializePropertiesObj,
  appendConsole,
} from '../services/processManager.js';
import {
  SOFTWARE_CATALOG,
  fetchSoftwareVersions,
  fetchPaperVersions,
  fetchPurpurVersions,
  fetchFoliaVersions,
  fetchVelocityVersions,
  fetchFabricVersions,
  fetchVanillaVersions,
  downloadMinecraftJar,
  searchModrinthContent,
  installModrinthContent,
  searchCurseForgeContent,
  installCurseForgeContent,
  lookupMinecraftUuid,
  pingMinecraftServer,
} from '../services/minecraftApi.js';
import { getLatestTelemetry, getServerTelemetryHistory, getDirSizeMb } from '../services/telemetry.js';
import { generateSftpPassword, getSftpLogs } from '../services/sftpServer.js';
import {
  assertSafeDocId,
  escapeHtml,
  parseFiniteNumber,
  sanitizeString,
  isValidIpAddress,
  validateRuntime,
  validateEntryFile,
  assertValidJvmFlagsInput,
  safeExtractZip,
} from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 25 } });

const heavyActionLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 15,
  keyFn: (req) => req.user?.uid || req.ip,
  message: 'Çok sık dosya/yedek/kurulum işlemi yaptınız. Lütfen kısa süre bekleyin.',
});

const powerLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 25,
  keyFn: (req) => req.user?.uid || req.ip,
});

const ALL_PERMS = ['power', 'console', 'files', 'backups', 'settings', 'sftp'];

async function loadOwnedServer(req, res, next) {
  try {
    let serverId;
    try {
      serverId = assertSafeDocId(req.params.id, 'sunucu kimliği');
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    const snap = await db.collection('servers').doc(serverId).get();
    if (!snap.exists) return res.status(404).json({ error: 'Sunucu bulunamadı' });
    const srv = { id: snap.id, ...snap.data() };
    const isOwner = srv.ownerUid === req.user.uid;
    const collab = (srv.collaborators || []).find((c) => c.uid === req.user.uid);

    if (!isOwner && !collab && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Bu sunucuya erişim yetkiniz yok' });
    }
    req.serverDoc = srv;
    req.isServerOwner = isOwner || req.user.isAdmin;
    req.permissions = req.isServerOwner ? ALL_PERMS : collab?.permissions || [];
    req.instanceDir = getInstanceDir(srv.category, srv.id);
    fs.mkdirSync(req.instanceDir, { recursive: true });
    next();
  } catch {
    res.status(500).json({ error: 'Sunucu doğrulaması başarısız' });
  }
}

function requirePerm(perm) {
  return (req, res, next) => {
    if (req.isServerOwner || req.permissions?.includes(perm)) return next();
    return res.status(403).json({ error: `Bu işlem için '${perm}' yetkisi gerekli` });
  };
}

function sanitizeServerForClient(srv, isOwnerOrAdmin, permissions) {
  const copy = { ...srv };
  if (!isOwnerOrAdmin && !permissions?.includes('sftp') && copy.sftp) {
    copy.sftp = { ...copy.sftp, password: '••••••••' };
  }
  return copy;
}

router.get('/', requireAuth, async (req, res) => {
  try {
    const [ownedSnap, sharedSnap] = await Promise.all([
      db.collection('servers').where('ownerUid', '==', req.user.uid).get(),
      db.collection('servers').where('collaboratorUids', 'array-contains', req.user.uid).get().catch(() => ({ docs: [] })),
    ]);

    const telemetry = getLatestTelemetry();
    const map = new Map();

    for (const d of ownedSnap.docs) {
      map.set(d.id, { id: d.id, ...d.data(), isShared: false, myPermissions: ALL_PERMS });
    }
    for (const d of sharedSnap.docs || []) {
      if (map.has(d.id)) continue;
      const data = d.data();
      const collab = (data.collaborators || []).find((c) => c.uid === req.user.uid);
      map.set(d.id, {
        id: d.id,
        ...sanitizeServerForClient(data, false, collab?.permissions),
        isShared: true,
        myPermissions: collab?.permissions || [],
      });
    }

    const servers = Array.from(map.values())
      .map((s) => ({ ...s, live: telemetry.perServer[s.id] || {} }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    res.json({ servers });
  } catch {
    res.status(500).json({ error: 'Sunucular yüklenemedi' });
  }
});

router.get('/mc/versions', requireAuth, async (req, res) => {
  try {
    const engine = req.query.engine ? String(req.query.engine).toLowerCase().trim() : '';
    if (engine) {
      const versions = await fetchSoftwareVersions(engine).catch(() => ['1.21.4', '1.21.1', '1.20.4']);
      return res.json({ engine, versions, catalog: SOFTWARE_CATALOG });
    }
    const [paper, purpur, folia, velocity, fabric, vanilla] = await Promise.all([
      fetchPaperVersions().catch(() => ['1.21.4', '1.21.1', '1.20.4']),
      fetchPurpurVersions().catch(() => ['1.21.4', '1.21.1', '1.20.4']),
      fetchFoliaVersions().catch(() => ['1.21.4', '1.20.6']),
      fetchVelocityVersions().catch(() => ['3.4.0-SNAPSHOT']),
      fetchFabricVersions().catch(() => ['1.21.4', '1.21.1', '1.20.4']),
      fetchVanillaVersions().catch(() => ['1.21.4', '1.21.1', '1.20.4']),
    ]);
    res.json({ catalog: SOFTWARE_CATALOG, paper, purpur, folia, velocity, fabric, vanilla });
  } catch {
    res.status(500).json({ error: 'Minecraft sürüm kataloğu alınamadı' });
  }
});

router.get('/mc/plugins/search', requireAuth, async (req, res) => {
  try {
    const q = String(req.query.q || '').slice(0, 120);
    const type = String(req.query.type || 'plugin');
    const source = String(req.query.source || 'all').toLowerCase();
    const loader = String(req.query.loader || '');
    const version = String(req.query.version || '');
    const category = String(req.query.category || 'popular');

    let cfApiKey = '';
    if (source === 'all' || source === 'curseforge') {
      try {
        const secSnap = await db.collection('system_config').doc('secrets').get();
        cfApiKey = secSnap.exists ? secSnap.data()?.curseforgeApiKey || '' : '';
      } catch {}
    }

    const tasks = [];
    if (source === 'all' || source === 'modrinth') {
      tasks.push(searchModrinthContent(q, { type, loader, version, category, limit: 16 }).catch(() => []));
    }
    if (source === 'all' || source === 'curseforge') {
      tasks.push(searchCurseForgeContent(q, { type, loader, version, category, limit: 16, apiKey: cfApiKey }).catch(() => []));
    }

    const results = await Promise.all(tasks);
    const merged = results.flat().sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
    res.json({ hits: merged, source });
  } catch {
    res.status(500).json({ error: 'Eklenti/mod araması başarısız' });
  }
});

router.get('/:id', requireAuth, loadOwnedServer, async (req, res) => {
  const srv = req.serverDoc;
  const telemetry = getLatestTelemetry();
  const live = telemetry.perServer[srv.id] || {
    status: activeProcesses.get(srv.id)?.status || srv.status,
    cpuPct: 0,
    ramUsedMb: 0,
    diskUsedMb: getDirSizeMb(req.instanceDir),
  };

  let extra = {};
  if (srv.category === 'minecraft') {
    const eulaPath = path.join(req.instanceDir, 'eula.txt');
    const eulaAccepted = fs.existsSync(eulaPath) && /eula\s*=\s*true/i.test(fs.readFileSync(eulaPath, 'utf8'));
    const hasJar =
      fs.existsSync(path.join(req.instanceDir, 'server.jar')) ||
      fs.existsSync(path.join(req.instanceDir, '.emoc-launch.json'));
    const hasIcon = fs.existsSync(path.join(req.instanceDir, 'server-icon.png'));
    const propsPath = path.join(req.instanceDir, 'server.properties');
    const props = fs.existsSync(propsPath) ? parsePropertiesText(fs.readFileSync(propsPath, 'utf8')) : {};
    extra = { eulaAccepted, hasJar, hasIcon, motd: props.motd || '', maxPlayers: props['max-players'] || '20' };
  } else if (srv.category === 'web') {
    try {
      extra.siteConfig = JSON.parse(fs.readFileSync(path.join(req.instanceDir, 'site.config.json'), 'utf8'));
    } catch {
      extra.siteConfig = {};
    }
    extra.webLogs = getWebLogs(srv.id);
  }

  res.json({
    server: sanitizeServerForClient(srv, req.isServerOwner, req.permissions),
    isServerOwner: req.isServerOwner,
    permissions: req.permissions,
    live,
    history: getServerTelemetryHistory(srv.id),
    console: getConsoleHistory(srv.id),
    extra,
  });
});

router.patch('/:id/name', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const name = sanitizeString(req.body?.name, { minLen: 2, maxLen: 36 });
    if (!name) return res.status(400).json({ error: 'Sunucu adı en az 2 karakter olmalıdır' });
    await db.collection('servers').doc(req.serverDoc.id).update({ name, updatedAt: Date.now() });
    res.json({ ok: true, name });
  } catch {
    res.status(500).json({ error: 'Sunucu adı güncellenemedi' });
  }
});

router.post('/:id/power', requireAuth, powerLimiter, loadOwnedServer, requirePerm('power'), async (req, res) => {
  try {
    const { action } = req.body;
    const srv = req.serverDoc;
    if (srv.status === 'suspended' && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Sunucu süresi dolmuş veya askıya alınmış. Yenileme yapın.' });
    }

    const powerMap = {
      start: { label: 'Başlatıldı', verb: 'SUNUCU_BASLATILDI', msg: 'çevrimiçi duruma geçti.' },
      stop: { label: 'Durduruldu', verb: 'SUNUCU_DURDURULDU', msg: 'güvenli şekilde durduruldu.' },
      pause: { label: 'Duraklatıldı', verb: 'SUNUCU_DURAKLATILDI', msg: 'uyku / duraklatılmış moda alındı.' },
      restart: { label: 'Yeniden Başlatıldı', verb: 'YENIDEN_BASLATILDI', msg: 'yeniden başlatıldı.' },
      kill: { label: 'Zorla Kapatıldı', verb: 'ZORLA_SONLANDIRILDI', msg: 'zorla sonlandırıldı.' },
    };

    if (action === 'start') {
      const r = await startServer(srv.id, req.user.email);
      await logServerActivity(srv.id, { actorEmail: req.user.email, action: powerMap.start.verb, category: 'power' });
      if (srv.ownerUid) {
        await pushUserNotification({
          uid: srv.ownerUid,
          title: `Sunucu Açıldı: ${srv.name}`,
          message: `${srv.name} (${srv.domainAddress || srv.slug}) ${powerMap.start.msg}`,
          type: 'server_power',
          createdBy: req.user.email,
        });
      }
      return res.json({ ok: true, ...r });
    }
    if (action === 'stop') {
      const r = await stopServer(srv.id, { pause: false });
      await logServerActivity(srv.id, { actorEmail: req.user.email, action: powerMap.stop.verb, category: 'power' });
      if (srv.ownerUid) {
        await pushUserNotification({
          uid: srv.ownerUid,
          title: `Sunucu Kapatıldı: ${srv.name}`,
          message: `${srv.name} (${srv.domainAddress || srv.slug}) ${powerMap.stop.msg}`,
          type: 'server_power',
          createdBy: req.user.email,
        });
      }
      return res.json({ ok: true, ...r });
    }
    if (action === 'pause') {
      const r = await stopServer(srv.id, { pause: true });
      await logServerActivity(srv.id, { actorEmail: req.user.email, action: powerMap.pause.verb, category: 'power' });
      if (srv.ownerUid) {
        await pushUserNotification({
          uid: srv.ownerUid,
          title: `Sunucu Duraklatıldı: ${srv.name}`,
          message: `${srv.name} (${srv.domainAddress || srv.slug}) ${powerMap.pause.msg}`,
          type: 'server_power',
          createdBy: req.user.email,
        });
      }
      return res.json({ ok: true, ...r });
    }
    if (action === 'restart') {
      const r = await restartServer(srv.id, req.user.email);
      await logServerActivity(srv.id, { actorEmail: req.user.email, action: powerMap.restart.verb, category: 'power' });
      if (srv.ownerUid) {
        await pushUserNotification({
          uid: srv.ownerUid,
          title: `Sunucu Yeniden Başlatıldı: ${srv.name}`,
          message: `${srv.name} (${srv.domainAddress || srv.slug}) ${powerMap.restart.msg}`,
          type: 'server_power',
          createdBy: req.user.email,
        });
      }
      return res.json({ ok: true, ...r });
    }
    if (action === 'kill') {
      const r = await stopServer(srv.id, { forceKill: true });
      await logServerActivity(srv.id, { actorEmail: req.user.email, action: powerMap.kill.verb, category: 'power' });
      if (srv.ownerUid) {
        await pushUserNotification({
          uid: srv.ownerUid,
          title: `Sunucu Kapatıldı: ${srv.name}`,
          message: `${srv.name} (${srv.domainAddress || srv.slug}) ${powerMap.kill.msg}`,
          type: 'server_power',
          createdBy: req.user.email,
        });
      }
      return res.json({ ok: true, ...r });
    }
    return res.status(400).json({ error: 'Geçersiz güç eylemi' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/command', requireAuth, loadOwnedServer, requirePerm('console'), async (req, res) => {
  try {
    const cmd = String(req.body.command || '').trim();
    if (!cmd) return res.status(400).json({ error: 'Komut boş olamaz' });
    sendConsoleCommand(req.serverDoc.id, cmd);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/console/clear', requireAuth, loadOwnedServer, requirePerm('console'), (req, res) => {
  clearConsoleHistory(req.serverDoc.id);
  res.json({ ok: true });
});

// ================= SFTP CREDENTIALS & LOGS =================
router.get('/:id/sftp', requireAuth, loadOwnedServer, requirePerm('sftp'), async (req, res) => {
  try {
    let sftp = req.serverDoc.sftp;
    if (!sftp || !sftp.password) {
      sftp = {
        enabled: true,
        username: `srv_${req.serverDoc.id}`,
        password: generateSftpPassword(),
      };
      await db.collection('servers').doc(req.serverDoc.id).update({ sftp });
    }
    res.json({
      host: ENV.PUBLIC_HOST,
      port: ENV.SFTP_PORT,
      username: sftp.username,
      password: sftp.password,
      enabled: sftp.enabled !== false,
      uri: `sftp://${sftp.username}@${ENV.PUBLIC_HOST}:${ENV.SFTP_PORT}`,
      logs: getSftpLogs(req.serverDoc.id),
    });
  } catch {
    res.status(500).json({ error: 'SFTP bilgileri alınamadı' });
  }
});

router.post('/:id/sftp/rotate', requireAuth, loadOwnedServer, requirePerm('sftp'), async (req, res) => {
  const nextPass = generateSftpPassword();
  const sftp = {
    enabled: req.serverDoc.sftp?.enabled !== false,
    username: req.serverDoc.sftp?.username || `srv_${req.serverDoc.id}`,
    password: nextPass,
  };
  await db.collection('servers').doc(req.serverDoc.id).update({ sftp, updatedAt: Date.now() });
  res.json({ ok: true, password: nextPass });
});

router.post('/:id/sftp/toggle', requireAuth, loadOwnedServer, requirePerm('sftp'), async (req, res) => {
  const enabled = Boolean(req.body.enabled);
  await db.collection('servers').doc(req.serverDoc.id).update({ 'sftp.enabled': enabled, updatedAt: Date.now() });
  res.json({ ok: true, enabled });
});

// ================= SERVER COLLABORATORS / SUB-ADMINS =================
router.get('/:id/collaborators', requireAuth, loadOwnedServer, (req, res) => {
  res.json({ collaborators: req.serverDoc.collaborators || [] });
});

router.post('/:id/collaborators', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    if (!req.isServerOwner) return res.status(403).json({ error: 'Yalnızca sunucu sahibi alt yetkili ekleyebilir' });
    const email = String(req.body.email || '').toLowerCase().trim();
    const permissions = Array.isArray(req.body.permissions)
      ? req.body.permissions.filter((p) => ALL_PERMS.includes(p))
      : ['power', 'console', 'files'];

    if (!email) return res.status(400).json({ error: 'E-posta adresi gerekli' });
    if (email === req.serverDoc.ownerEmail) return res.status(400).json({ error: 'Sunucu sahibini alt yetkili olarak ekleyemezsiniz' });

    const uSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (uSnap.empty) return res.status(404).json({ error: 'Bu e-posta ile kayıtlı EmoçHosting kullanıcısı bulunamadı' });

    const target = uSnap.docs[0];
    const targetData = target.data();
    const current = (req.serverDoc.collaborators || []).filter((c) => c.uid !== target.id);
    current.push({
      uid: target.id,
      email: targetData.email,
      displayName: targetData.displayName || email.split('@')[0],
      permissions,
      addedAt: Date.now(),
    });
    const uids = current.map((c) => c.uid);

    await db.collection('servers').doc(req.serverDoc.id).update({
      collaborators: current,
      collaboratorUids: uids,
      updatedAt: Date.now(),
    });
    await writeAuditLog({
      actorEmail: req.user.email,
      action: 'COLLABORATOR_ADDED',
      targetType: 'server',
      targetId: req.serverDoc.id,
      details: { email, permissions },
    });
    res.json({ ok: true, collaborators: current });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id/collaborators/:uid', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    if (!req.isServerOwner) return res.status(403).json({ error: 'Yalnızca sunucu sahibi düzenleyebilir' });
    const targetUid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    if (!Array.isArray(req.body?.permissions)) {
      return res.status(400).json({ error: 'Yetkiler geçerli bir dizi olmalıdır' });
    }
    const permissions = req.body.permissions.filter((p) => ALL_PERMS.includes(p));
    const next = (req.serverDoc.collaborators || []).map((c) =>
      c.uid === targetUid ? { ...c, permissions } : c
    );
    await db.collection('servers').doc(req.serverDoc.id).update({ collaborators: next, updatedAt: Date.now() });
    res.json({ ok: true, collaborators: next });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/collaborators/:uid', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    if (!req.isServerOwner) return res.status(403).json({ error: 'Yalnızca sunucu sahibi kaldırabilir' });
    const targetUid = assertSafeDocId(req.params.uid, 'kullanıcı kimliği');
    const next = (req.serverDoc.collaborators || []).filter((c) => c.uid !== targetUid);
    const uids = next.map((c) => c.uid);
    await db.collection('servers').doc(req.serverDoc.id).update({
      collaborators: next,
      collaboratorUids: uids,
      updatedAt: Date.now(),
    });
    res.json({ ok: true, collaborators: next });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= PRO FILE MANAGER =================
router.get('/:id/files', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const target = resolveSafePath(req.instanceDir, rel);
    if (!fs.existsSync(target)) return res.json({ path: rel, entries: [], diskUsedMb: getDirSizeMb(req.instanceDir) });
    const entries = fs
      .readdirSync(target, { withFileTypes: true })
      .filter((e) => !e.isSymbolicLink())
      .map((e) => {
        const full = path.join(target, e.name);
        let size = 0;
        let mtime = 0;
        try {
          const st = fs.lstatSync(full);
          if (st.isSymbolicLink()) return null;
          size = st.size;
          mtime = st.mtimeMs;
        } catch {}
        return {
          name: e.name,
          isDir: e.isDirectory(),
          size,
          mtime,
          path: rel ? `${rel.replace(/\/$/, '')}/${e.name}` : e.name,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));

    res.json({ path: rel, entries, diskUsedMb: getDirSizeMb(req.instanceDir) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/file', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const target = resolveSafePath(req.instanceDir, rel);
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'Dosya bulunamadı' });
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }
    if (stat.size > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Dosya editörde açmak için çok büyük (>3MB). İndirip düzenleyebilirsiniz.' });
    }
    const content = fs.readFileSync(target, 'utf8');
    res.json({ path: rel, content, size: stat.size });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/raw', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const target = resolveSafePath(req.instanceDir, rel);
    if (!fs.existsSync(target)) return res.status(404).end();
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      return res.status(404).end();
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.sendFile(target);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/file', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const { path: rel, content = '' } = req.body;
    const text = typeof content === 'string' ? content : String(content ?? '');
    const newBytes = Buffer.byteLength(text, 'utf8');
    if (newBytes > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Dosya boyutu editörde kaydetmek için çok büyük (Max 10 MB)' });
    }
    const target = resolveSafePath(req.instanceDir, rel);
    const oldBytes = fs.existsSync(target) && fs.lstatSync(target).isFile() ? fs.lstatSync(target).size : 0;
    const diskUsed = getDirSizeMb(req.instanceDir);
    if (diskUsed + (newBytes - oldBytes) / (1024 * 1024) > Number(req.serverDoc.allocatedDiskMb || 5120)) {
      return res.status(400).json({ error: 'Sunucu disk kotası dolu' });
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mkdir', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const target = resolveSafePath(req.instanceDir, req.body.path);
    fs.mkdirSync(target, { recursive: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/rename', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const fromPath = resolveSafePath(req.instanceDir, req.body.from);
    const toPath = resolveSafePath(req.instanceDir, req.body.to);
    if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Kaynak bulunamadı' });
    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.renameSync(fromPath, toPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/copy', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const fromPath = resolveSafePath(req.instanceDir, req.body.from);
    const toPath = resolveSafePath(req.instanceDir, req.body.to);
    if (!fs.existsSync(fromPath)) return res.status(404).json({ error: 'Kaynak bulunamadı' });
    const srcStat = fs.lstatSync(fromPath);
    if (srcStat.isSymbolicLink()) return res.status(400).json({ error: 'Sembolik bağlantılar kopyalanamaz' });
    if (srcStat.isDirectory() && (toPath === fromPath || toPath.startsWith(fromPath + path.sep))) {
      return res.status(400).json({ error: 'Klasör kendi alt dizinine kopyalanamaz' });
    }
    const copyMb = srcStat.isDirectory() ? getDirSizeMb(fromPath) : srcStat.size / (1024 * 1024);
    const diskUsed = getDirSizeMb(req.instanceDir);
    if (diskUsed + copyMb > Number(req.serverDoc.allocatedDiskMb || 5120)) {
      return res.status(400).json({ error: 'Sunucu disk kotası bu kopyalama işlemi için yeterli değil' });
    }
    fs.cpSync(fromPath, toPath, {
      recursive: true,
      dereference: false,
      filter: (src) => {
        try {
          return !fs.lstatSync(src).isSymbolicLink();
        } catch {
          return false;
        }
      },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/extract', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const archivePath = resolveSafePath(req.instanceDir, req.body.path);
    const destDir = resolveSafePath(req.instanceDir, req.body.destDir || path.dirname(String(req.body.path || '')));
    if (!fs.existsSync(archivePath) || !archivePath.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Geçerli bir .zip arşivi seçin' });
    }
    if (fs.lstatSync(archivePath).isSymbolicLink()) {
      return res.status(400).json({ error: 'Sembolik bağlantı arşivler açılamaz' });
    }
    const remainingMb = Math.max(1, Number(req.serverDoc.allocatedDiskMb || 5120) - getDirSizeMb(req.instanceDir));
    const maxExtractBytes = Math.min(512 * 1024 * 1024, Math.floor(remainingMb * 1024 * 1024));
    safeExtractZip(archivePath, destDir, {
      resolveSafePathFn: resolveSafePath,
      maxEntries: 5000,
      maxTotalBytes: maxExtractBytes,
      maxFileBytes: Math.min(150 * 1024 * 1024, maxExtractBytes),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/compress', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('files'), async (req, res) => {
  try {
    const pathsList = Array.isArray(req.body.paths) ? req.body.paths.slice(0, 100) : [];
    const outRel = String(req.body.outName || `archive-${Date.now()}.zip`);
    if (!outRel.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Çıktı arşiv dosyası .zip uzantılı olmalıdır' });
    }
    const outPath = resolveSafePath(req.instanceDir, outRel);
    if (pathsList.length === 0) return res.status(400).json({ error: 'Arşivlenecek dosya seçin' });
    if (getDirSizeMb(req.instanceDir) >= Number(req.serverDoc.allocatedDiskMb || 5120)) {
      return res.status(400).json({ error: 'Disk kotası dolduğu için yeni arşiv oluşturulamıyor' });
    }

    await new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      output.on('close', resolve);
      archive.on('error', reject);
      archive.pipe(output);
      for (const rel of pathsList) {
        const full = resolveSafePath(req.instanceDir, rel);
        if (!fs.existsSync(full)) continue;
        const st = fs.lstatSync(full);
        if (st.isSymbolicLink()) continue;
        if (st.isDirectory()) {
          archive.glob('**/*', { cwd: full, dot: true, followSymlinks: false }, { prefix: path.basename(full) });
        } else {
          archive.file(full, { name: path.basename(full) });
        }
      }
      archive.finalize();
    });
    res.json({ ok: true, outPath: outRel });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/bulk-delete', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const items = Array.isArray(req.body.paths) ? req.body.paths : [];
    for (const rel of items) {
      if (!rel) continue;
      const target = resolveSafePath(req.instanceDir, rel);
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    }
    res.json({ ok: true, count: items.length });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/file', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const rel = String(req.query.path || '');
    if (!rel) return res.status(400).json({ error: 'Kök klasör silinemez' });
    const target = resolveSafePath(req.instanceDir, rel);
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post(
  '/:id/upload',
  requireAuth,
  loadOwnedServer,
  requirePerm('files'),
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'files', maxCount: 25 },
  ]),
  async (req, res) => {
    try {
      const allFiles = [...(req.files?.file || []), ...(req.files?.files || [])];
      if (allFiles.length === 0) return res.status(400).json({ error: 'Dosya seçilmedi' });

      const sysCfg = await getSystemConfig();
      const maxMb = Number(sysCfg.maxUploadMb || 100);
      const totalNewBytes = allFiles.reduce((s, f) => s + f.size, 0);
      if (totalNewBytes > maxMb * 1024 * 1024) {
        return res.status(400).json({ error: `Yükleme boyutu limiti aşıyor (Max ${maxMb} MB)` });
      }
      const diskUsed = getDirSizeMb(req.instanceDir);
      if (diskUsed + totalNewBytes / (1024 * 1024) > Number(req.serverDoc.allocatedDiskMb || 5120)) {
        return res.status(400).json({ error: 'Sunucu disk kotası dolu' });
      }
      const dirRel = String(req.body.dir || '');
      const uploaded = [];
      for (const f of allFiles) {
        const outPath = resolveSafePath(req.instanceDir, dirRel ? `${dirRel}/${f.originalname}` : f.originalname);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, f.buffer);
        uploaded.push(f.originalname);
      }
      res.json({ ok: true, files: uploaded });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

router.get('/:id/download', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const rel = String(req.query.path || '');
    const target = resolveSafePath(req.instanceDir, rel);
    if (!fs.existsSync(target)) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || stat.isDirectory()) {
      return res.status(404).json({ error: 'Dosya bulunamadı' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(target);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/logs/latest', requireAuth, loadOwnedServer, requirePerm('console'), (req, res) => {
  const candidates = [
    path.join(req.instanceDir, 'logs', 'latest.log'),
    path.join(req.instanceDir, 'logs', 'output.log'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/).slice(-500);
      return res.json({ exists: true, file: path.basename(p), lines });
    }
  }
  res.json({ exists: false, lines: [] });
});

// ================= BACKUPS =================
router.get('/:id/backups', requireAuth, loadOwnedServer, requirePerm('backups'), async (req, res) => {
  try {
    const backups = await listServerBackups(req.serverDoc.id);
    res.json({ backups, limit: req.serverDoc.backupsLimit || 3 });
  } catch {
    res.status(500).json({ error: 'Yedek listesi alınamadı' });
  }
});

router.post('/:id/backups', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('backups'), async (req, res) => {
  try {
    const existing = await listServerBackups(req.serverDoc.id);
    if (existing.length >= Number(req.serverDoc.backupsLimit || 3) && !req.user.isAdmin) {
      return res.status(400).json({ error: `Yedekleme limiti (${req.serverDoc.backupsLimit || 3}) doldu. Önce eski bir yedeği silin.` });
    }
    const note = sanitizeString(req.body?.note || 'Manuel Yedek', { maxLen: 80 }) || 'Manuel Yedek';
    const backup = await createServerBackupZip(req.serverDoc, note);
    await logServerActivity(req.serverDoc.id, {
      actorEmail: req.user.email,
      action: 'YEDEK_OLUSTURULDU',
      category: 'backup',
      details: { filename: backup.filename },
    });
    res.status(201).json({ ok: true, backup });
  } catch {
    res.status(500).json({ error: 'Yedek oluşturulamadı' });
  }
});

router.post('/:id/backups/restore', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('backups'), async (req, res) => {
  try {
    const filename = assertSafeDocId(req.body?.filename, 'yedek dosya adı', { allowDots: true });
    if (!filename.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Geçersiz yedek dosya uzantısı' });
    }
    const result = await restoreServerBackupZip(req.serverDoc, filename);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/backups/:filename', requireAuth, loadOwnedServer, requirePerm('backups'), async (req, res) => {
  try {
    const filename = assertSafeDocId(req.params.filename, 'yedek dosya adı', { allowDots: true });
    if (!filename.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Geçersiz yedek dosya uzantısı' });
    }
    await deleteServerBackupZip(req.serverDoc.id, filename);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/backups/:filename/download', requireAuth, loadOwnedServer, requirePerm('backups'), (req, res) => {
  try {
    const filename = assertSafeDocId(req.params.filename, 'yedek dosya adı', { allowDots: true });
    if (!filename.toLowerCase().endsWith('.zip')) {
      return res.status(400).json({ error: 'Geçersiz yedek dosya uzantısı' });
    }
    const bDir = getServerBackupDir(req.serverDoc.id);
    const file = resolveSafePath(bDir, filename);
    if (!fs.existsSync(file) || fs.lstatSync(file).isSymbolicLink()) {
      return res.status(404).json({ error: 'Yedek bulunamadı' });
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.download(file);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= SCHEDULED TASKS =================
const ALLOWED_TASK_ACTIONS = new Set(['restart', 'backup', 'command', 'start', 'stop']);

router.post('/:id/tasks', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const action = String(req.body?.action || 'restart').trim().toLowerCase();
    if (!ALLOWED_TASK_ACTIONS.has(action)) {
      return res.status(400).json({ error: 'Geçersiz görev eylemi' });
    }
    const intervalMinutes = parseFiniteNumber(req.body?.intervalMinutes ?? 120, {
      min: 5,
      max: 43200,
      integer: true,
      label: 'Çalışma aralığı (dk)',
    });
    const tasks = Array.isArray(req.serverDoc.scheduledTasks) ? [...req.serverDoc.scheduledTasks] : [];
    if (tasks.length >= 20) {
      return res.status(400).json({ error: 'En fazla 20 zamanlanmış görev tanımlanabilir' });
    }
    const name = sanitizeString(req.body?.name || action, { minLen: 1, maxLen: 40 }) || action;
    const payload = sanitizeString(req.body?.payload || '', { maxLen: 200 }) || '';
    tasks.push({
      id: Date.now().toString(36),
      name,
      action,
      intervalMinutes,
      payload,
      enabled: true,
      nextRunAt: Date.now() + intervalMinutes * 60 * 1000,
      lastRunAt: null,
    });
    await db.collection('servers').doc(req.serverDoc.id).update({ scheduledTasks: tasks });
    res.json({ ok: true, tasks });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/tasks/:taskId', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const taskId = assertSafeDocId(req.params.taskId, 'görev kimliği');
    const tasks = (req.serverDoc.scheduledTasks || []).filter((t) => t.id !== taskId);
    await db.collection('servers').doc(req.serverDoc.id).update({ scheduledTasks: tasks });
    res.json({ ok: true, tasks });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= MINECRAFT PANEL ROUTES =================
router.post('/:id/mc/install-version', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const { engine = 'paper', version = '1.21.4' } = req.body;
    if (activeProcesses.get(req.serverDoc.id)?.status === 'running') {
      return res.status(400).json({ error: 'Sürüm değiştirmeden önce sunucuyu durdurun' });
    }
    const info = await downloadMinecraftJar({
      engine,
      version,
      targetDir: req.instanceDir,
      onProgress: (msg) => appendConsole(req.serverDoc.id, `[Sürüm Kurucu] ${msg}`, 'system'),
    });
    await db.collection('servers').doc(req.serverDoc.id).update({
      'config.mcEngine': engine,
      'config.mcVersion': version,
      updatedAt: Date.now(),
    });
    await logServerActivity(req.serverDoc.id, {
      actorEmail: req.user.email,
      action: 'YAZILIM_KURULDU',
      category: 'minecraft',
      details: { engine, version },
    });
    res.json({ ok: true, ...info });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mc/upload-jar', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('settings'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'JAR dosyası seçin' });
    if (req.serverDoc.category !== 'minecraft') {
      return res.status(400).json({ error: 'Bu işlem yalnızca Minecraft sunucuları içindir' });
    }
    if (activeProcesses.get(req.serverDoc.id)?.status === 'running') {
      return res.status(400).json({ error: 'Özel JAR yüklemeden önce sunucuyu durdurun' });
    }
    const buf = req.file.buffer;
    if (!buf || buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
      return res.status(400).json({ error: 'Geçersiz JAR/ZIP dosyası' });
    }
    const diskUsed = getDirSizeMb(req.instanceDir);
    if (diskUsed + buf.length / (1024 * 1024) > Number(req.serverDoc.allocatedDiskMb || 5120)) {
      return res.status(400).json({ error: 'Sunucu disk kotası dolu' });
    }
    const verName = sanitizeString(req.file.originalname, { minLen: 1, maxLen: 80 }) || 'custom.jar';
    fs.writeFileSync(resolveSafePath(req.instanceDir, 'server.jar'), buf);
    await db.collection('servers').doc(req.serverDoc.id).update({
      'config.mcEngine': 'custom',
      'config.mcVersion': verName,
      updatedAt: Date.now(),
    });
    res.json({ ok: true, sizeMb: Number((req.file.size / (1024 * 1024)).toFixed(2)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mc/eula', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const accepted = Boolean(req.body.accepted);
  fs.writeFileSync(resolveSafePath(req.instanceDir, 'eula.txt'), `eula=${accepted ? 'true' : 'false'}\n`);
  res.json({ ok: true, accepted });
});

router.get('/:id/mc/icon', requireAuth, loadOwnedServer, (req, res) => {
  const iconPath = resolveSafePath(req.instanceDir, 'server-icon.png');
  if (!fs.existsSync(iconPath) || fs.lstatSync(iconPath).isSymbolicLink()) return res.status(404).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(iconPath);
});

router.post('/:id/mc/icon', requireAuth, loadOwnedServer, requirePerm('settings'), upload.single('icon'), (req, res) => {
  try {
    let buf;
    if (req.file) {
      buf = req.file.buffer;
    } else if (req.body.base64) {
      const cleaned = String(req.body.base64).replace(/^data:image\/png;base64,/, '');
      if (cleaned.length > 3 * 1024 * 1024) {
        return res.status(400).json({ error: 'İkon dosyası en fazla 2 MB olabilir' });
      }
      buf = Buffer.from(cleaned, 'base64');
    } else {
      return res.status(400).json({ error: 'PNG ikon dosyası gerekli' });
    }
    const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (!buf || buf.length < 8 || buf.length > 2 * 1024 * 1024 || !buf.subarray(0, 8).equals(PNG_SIG)) {
      return res.status(400).json({ error: 'Yalnızca geçerli ve 2 MB altında PNG dosyaları kabul edilir' });
    }
    fs.writeFileSync(resolveSafePath(req.instanceDir, 'server-icon.png'), buf);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mc/motd', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const file = resolveSafePath(req.instanceDir, 'server.properties');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const props = parsePropertiesText(raw);
  props.motd = String(req.body.motd || '').replace(/[\r\n\0]/g, '\\n').slice(0, 500);
  props['server-port'] = req.serverDoc.port;
  props['query.port'] = req.serverDoc.port;
  fs.writeFileSync(file, serializePropertiesObj(props));
  res.json({ ok: true, motd: props.motd });
});

router.get('/:id/mc/properties', requireAuth, loadOwnedServer, (req, res) => {
  const file = resolveSafePath(req.instanceDir, 'server.properties');
  const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  res.json({ properties: parsePropertiesText(raw), raw });
});

router.post('/:id/mc/properties', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  try {
    const file = resolveSafePath(req.instanceDir, 'server.properties');
    if (typeof req.body.raw === 'string') {
      if (Buffer.byteLength(req.body.raw, 'utf8') > 64 * 1024) {
        return res.status(400).json({ error: 'server.properties boyutu 64 KB sınırını aşamaz' });
      }
      const parsed = parsePropertiesText(req.body.raw);
      parsed['server-port'] = req.serverDoc.port;
      parsed['query.port'] = req.serverDoc.port;
      fs.writeFileSync(file, serializePropertiesObj(parsed), 'utf8');
    } else {
      const merged = { ...(req.body.properties || {}), 'server-port': req.serverDoc.port, 'query.port': req.serverDoc.port };
      fs.writeFileSync(file, serializePropertiesObj(merged), 'utf8');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/mc/players-lists', requireAuth, loadOwnedServer, (req, res) => {
  const readJson = (name) => {
    const p = path.join(req.instanceDir, name);
    try {
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
    } catch {
      return [];
    }
  };
  res.json({
    ops: readJson('ops.json'),
    whitelist: readJson('whitelist.json'),
    bannedPlayers: readJson('banned-players.json'),
    bannedIps: readJson('banned-ips.json'),
  });
});

router.post('/:id/mc/players-lists', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const { listName, items } = req.body;
  const allowed = ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json'];
  if (!allowed.includes(listName)) return res.status(400).json({ error: 'Geçersiz liste dosyası' });
  fs.writeFileSync(path.join(req.instanceDir, listName), JSON.stringify(Array.isArray(items) ? items : [], null, 2));
  res.json({ ok: true });
});

router.post('/:id/mc/players-lists/add', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const { listName, username, level = 4, bypassesPlayerLimit = false, reason = 'Sunucu yetkilisi tarafından yasaklandı' } = req.body;
    const allowed = ['ops.json', 'whitelist.json', 'banned-players.json'];
    if (!allowed.includes(listName)) return res.status(400).json({ error: 'Geçersiz liste' });
    const cleanUser = String(username || '').trim();
    if (!/^[a-zA-Z0-9_]{2,16}$/.test(cleanUser)) {
      return res.status(400).json({ error: 'Geçersiz Minecraft kullanıcı adı (2-16 harf/rakam/_)' });
    }

    const { uuid, name, official } = await lookupMinecraftUuid(cleanUser);
    const filePath = resolveSafePath(req.instanceDir, listName);
    let current = [];
    try {
      current = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : [];
    } catch {}
    current = current.filter((x) => x.name?.toLowerCase() !== name.toLowerCase());

    if (listName === 'ops.json') {
      const opLevel = parseFiniteNumber(level ?? 4, { min: 1, max: 4, integer: true, label: 'OP seviyesi' });
      current.push({ uuid, name, level: opLevel, bypassesPlayerLimit: Boolean(bypassesPlayerLimit) });
    } else if (listName === 'banned-players.json') {
      const safeReason = sanitizeString(reason, { maxLen: 200 }) || 'Sunucu yetkilisi tarafından yasaklandı';
      current.push({
        uuid,
        name,
        created: new Date().toISOString(),
        source: req.user.email,
        expires: 'forever',
        reason: safeReason,
      });
    } else {
      current.push({ uuid, name });
    }
    fs.writeFileSync(filePath, JSON.stringify(current, null, 2));
    res.json({ ok: true, items: current, officialUuid: official });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/mc/installed', requireAuth, loadOwnedServer, (req, res) => {
  const readFolder = (rel) => {
    const full = path.join(req.instanceDir, rel);
    if (!fs.existsSync(full)) return [];
    return fs
      .readdirSync(full)
      .filter((f) => /\.(jar|zip)(\.disabled)?$/i.test(f))
      .map((f) => {
        const st = fs.statSync(path.join(full, f));
        return {
          filename: f,
          enabled: !f.endsWith('.disabled'),
          sizeKb: Math.round(st.size / 1024),
          mtime: st.mtimeMs,
        };
      });
  };
  res.json({
    plugins: readFolder('plugins'),
    mods: readFolder('mods'),
    datapacks: readFolder(path.join('world', 'datapacks')),
  });
});

router.post('/:id/mc/installed/toggle', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const { folder = 'plugins', filename } = req.body;
    const allowedFolders = ['plugins', 'mods', 'world/datapacks'];
    if (!allowedFolders.includes(folder)) return res.status(400).json({ error: 'Geçersiz klasör' });
    const safeFilename = assertSafeDocId(filename, 'dosya adı', { allowDots: true, maxLen: 180 });
    const full = resolveSafePath(req.instanceDir, `${folder}/${safeFilename}`);
    if (!fs.existsSync(full) || fs.lstatSync(full).isSymbolicLink()) return res.status(404).json({ error: 'Dosya bulunamadı' });
    const nextPath = full.endsWith('.disabled') ? full.slice(0, -9) : `${full}.disabled`;
    fs.renameSync(full, nextPath);
    res.json({ ok: true, filename: path.basename(nextPath) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id/mc/installed', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  try {
    const { folder = 'plugins', filename } = req.query;
    const allowedFolders = ['plugins', 'mods', 'world/datapacks'];
    if (!allowedFolders.includes(String(folder))) return res.status(400).json({ error: 'Geçersiz klasör' });
    const safeFilename = assertSafeDocId(filename, 'dosya adı', { allowDots: true, maxLen: 180 });
    const full = resolveSafePath(req.instanceDir, `${folder}/${safeFilename}`);
    if (fs.existsSync(full) && !fs.lstatSync(full).isSymbolicLink()) fs.unlinkSync(full);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mc/plugins/install', requireAuth, heavyActionLimiter, loadOwnedServer, requirePerm('files'), async (req, res) => {
  try {
    const type = String(req.body.type || 'plugin');
    if (!['plugin', 'mod', 'datapack', 'modpack'].includes(type)) {
      return res.status(400).json({ error: 'Geçersiz içerik türü' });
    }
    const source = String(req.body.source || 'modrinth').toLowerCase();
    if (!['modrinth', 'curseforge'].includes(source)) {
      return res.status(400).json({ error: 'Geçersiz eklenti/mod kaynağı' });
    }
    const diskUsed = getDirSizeMb(req.instanceDir);
    if (diskUsed >= Number(req.serverDoc.allocatedDiskMb || 5120)) {
      return res.status(400).json({ error: 'Sunucu disk kotası dolu' });
    }
    const version = String(req.body.version || req.serverDoc.config?.mcVersion || '');
    const loader = String(req.body.loader || req.serverDoc.config?.mcEngine || '');
    let result;

    if (source === 'curseforge') {
      let cfApiKey = '';
      try {
        const secSnap = await db.collection('system_config').doc('secrets').get();
        cfApiKey = secSnap.exists ? secSnap.data()?.curseforgeApiKey || '' : '';
      } catch {}
      result = await installCurseForgeContent({
        modId: req.body.projectId,
        targetDir: req.instanceDir,
        type,
        version,
        apiKey: cfApiKey,
      });
    } else {
      result = await installModrinthContent({
        projectId: req.body.projectId,
        targetDir: req.instanceDir,
        type,
        version,
        loader,
      });
    }

    appendConsole(req.serverDoc.id, `[${source === 'curseforge' ? 'CurseForge' : 'Modrinth'}] ${result.filename} (${result.folder}/) kuruldu.`, 'system');
    await logServerActivity(req.serverDoc.id, {
      actorEmail: req.user.email,
      action: 'MOD_EKLENTI_KURULDU',
      category: 'content',
      details: { source, filename: result.filename, folder: result.folder },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id/mc/worlds', requireAuth, loadOwnedServer, (req, res) => {
  const worlds = ['world', 'world_nether', 'world_the_end'].map((w) => {
    const full = path.join(req.instanceDir, w);
    const exists = fs.existsSync(full);
    return { name: w, exists, sizeMb: exists ? getDirSizeMb(full) : 0 };
  });
  res.json({ worlds });
});

router.post('/:id/mc/worlds/reset', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  const worldName = String(req.body.worldName || 'world');
  if (!['world', 'world_nether', 'world_the_end'].includes(worldName)) {
    return res.status(400).json({ error: 'Geçersiz dünya adı' });
  }
  if (activeProcesses.get(req.serverDoc.id)?.status === 'running') {
    return res.status(400).json({ error: 'Dünyayı sıfırlamadan önce sunucuyu durdurun' });
  }
  const full = path.join(req.instanceDir, worldName);
  if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
  fs.mkdirSync(full, { recursive: true });
  res.json({ ok: true });
});

router.post('/:id/mc/flags', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const { jvmFlags = ['-XX:+UseG1GC'], autoRestart } = req.body || {};
    const validatedFlags = assertValidJvmFlagsInput(jvmFlags);
    await db.collection('servers').doc(req.serverDoc.id).update({
      'config.jvmFlags': validatedFlags.length > 0 ? validatedFlags : ['-XX:+UseG1GC'],
      'config.autoRestart': Boolean(autoRestart),
      updatedAt: Date.now(),
    });
    res.json({ ok: true, jvmFlags: validatedFlags });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= ENV & DISCORD / ALTYAPI =================
router.get('/:id/env', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const envFile = path.join(req.instanceDir, '.env');
  const raw = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  res.json({ env: parseEnvText(raw), raw });
});

router.post('/:id/env', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const envFile = path.join(req.instanceDir, '.env');
  if (typeof req.body.raw === 'string') {
    fs.writeFileSync(envFile, req.body.raw, 'utf8');
  } else {
    fs.writeFileSync(envFile, serializeEnvObj(req.body.env || {}), 'utf8');
  }
  res.json({ ok: true });
});

router.post('/:id/discord/install', requireAuth, loadOwnedServer, requirePerm('files'), async (req, res) => {
  try {
    await runServerInstallCommand(req.serverDoc.id, req.serverDoc.category, req.body.command || 'npm-install');
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/discord/config', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const { runtime = 'node', entryFile = 'index.js', autoRestart = true } = req.body || {};
    const validRuntime = validateRuntime('discord', runtime);
    const validEntry = validateEntryFile(
      req.instanceDir,
      entryFile || (validRuntime === 'python' ? 'bot.py' : 'index.js'),
      resolveSafePath
    );
    await db.collection('servers').doc(req.serverDoc.id).update({
      'config.runtime': validRuntime,
      'config.entryFile': validEntry,
      'config.autoRestart': Boolean(autoRestart),
      updatedAt: Date.now(),
    });
    res.json({ ok: true, runtime: validRuntime, entryFile: validEntry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/discord/apply-template', requireAuth, loadOwnedServer, requirePerm('files'), async (req, res) => {
  const { templateId } = req.body;
  if (templateId === 'bot-python-py') {
    fs.writeFileSync(
      path.join(req.instanceDir, 'bot.py'),
      `import os, discord\nfrom discord.ext import commands\nfrom dotenv import load_dotenv\nload_dotenv()\nintents = discord.Intents.default()\nintents.message_content = True\nbot = commands.Bot(command_prefix=os.getenv("PREFIX", "!"), intents=intents)\n@bot.event\nasync def on_ready():\n    print(f"Giriş yapıldı: {bot.user}")\n@bot.command()\nasync def ping(ctx):\n    await ctx.send(f"Pong! {round(bot.latency * 1000)}ms (EmoçHosting)")\nbot.run(os.getenv("DISCORD_TOKEN"))\n`
    );
    await db.collection('servers').doc(req.serverDoc.id).update({ 'config.runtime': 'python', 'config.entryFile': 'bot.py' });
  } else {
    fs.writeFileSync(
      path.join(req.instanceDir, 'package.json'),
      JSON.stringify({ name: 'emoc-discord-bot', version: '1.0.0', main: 'index.js', dependencies: { 'discord.js': '^14.16.3', dotenv: '^16.4.7' } }, null, 2)
    );
    await db.collection('servers').doc(req.serverDoc.id).update({ 'config.runtime': 'node', 'config.entryFile': 'index.js' });
  }
  res.json({ ok: true });
});

// ================= WEBSITE HOSTING ROUTES =================
router.get('/:id/web/config', requireAuth, loadOwnedServer, (req, res) => {
  const p = path.join(req.instanceDir, 'site.config.json');
  const config = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  res.json({ config, logs: getWebLogs(req.serverDoc.id) });
});

router.post('/:id/web/config', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  try {
    const p = resolveSafePath(req.instanceDir, 'site.config.json');
    const current = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    const incoming = req.body?.config && typeof req.body.config === 'object' ? req.body.config : {};

    const nextMode = incoming.mode !== undefined ? (incoming.mode === 'node' ? 'node' : 'static') : (current.mode || 'static');
    const nextEntry =
      incoming.entryFile !== undefined
        ? validateEntryFile(req.instanceDir, incoming.entryFile, resolveSafePath)
        : current.entryFile || 'app.js';

    const nextBlockedIps = Array.isArray(incoming.blockedIps)
      ? incoming.blockedIps
          .slice(0, 100)
          .map((ip) => String(ip || '').trim())
          .filter((ip) => isValidIpAddress(ip))
      : Array.isArray(current.blockedIps)
      ? current.blockedIps
      : [];

    const next = {
      ...current,
      mode: nextMode,
      entryFile: nextEntry,
      directoryListing: incoming.directoryListing !== undefined ? Boolean(incoming.directoryListing) : Boolean(current.directoryListing),
      corsEnabled: incoming.corsEnabled !== undefined ? Boolean(incoming.corsEnabled) : current.corsEnabled !== false,
      spaFallback: incoming.spaFallback !== undefined ? Boolean(incoming.spaFallback) : Boolean(current.spaFallback),
      basicAuthEnabled: incoming.basicAuthEnabled !== undefined ? Boolean(incoming.basicAuthEnabled) : Boolean(current.basicAuthEnabled),
      basicAuthUser:
        incoming.basicAuthUser !== undefined
          ? sanitizeString(incoming.basicAuthUser, { maxLen: 40 }) || 'admin'
          : current.basicAuthUser || 'admin',
      basicAuthPass:
        incoming.basicAuthPass !== undefined
          ? sanitizeString(incoming.basicAuthPass, { maxLen: 100 }) || ''
          : current.basicAuthPass || '',
      blockedIps: nextBlockedIps,
      sslRedirect: incoming.sslRedirect !== undefined ? Boolean(incoming.sslRedirect) : Boolean(current.sslRedirect),
    };
    fs.writeFileSync(p, JSON.stringify(next, null, 2));
    res.json({ ok: true, config: next });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/web/apply-template', requireAuth, loadOwnedServer, requirePerm('files'), (req, res) => {
  const { templateId } = req.body;
  const pub = resolveSafePath(req.instanceDir, 'public_html');
  fs.mkdirSync(pub, { recursive: true });
  const safeName = escapeHtml(req.serverDoc.name);
  if (templateId === 'web-coming-soon') {
    fs.writeFileSync(
      path.join(pub, 'index.html'),
      `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${safeName} — Yakında</title><style>body{margin:0;height:100vh;display:grid;place-items:center;background:#04060c;color:#fff;font-family:sans-serif}div{text-align:center;padding:40px;border:1px solid #00f0ff44;border-radius:24px;background:#0b1120}h1{color:#00f0ff}</style></head><body><div><h1>${safeName}</h1><p>Çok yakında harika bir projeyle yayındayız.</p></div></body></html>`
    );
  } else {
    fs.writeFileSync(
      path.join(pub, 'index.html'),
      `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${safeName}</title><style>body{margin:0;min-height:100vh;background:#09090b;color:#f4f4f5;font-family:system-ui;padding:60px 24px}.wrap{max-width:860px;margin:auto}.hero{padding:48px;border-radius:24px;background:#111216;border:1px solid rgba(255,255,255,.08)}h1{font-size:44px;margin:0 0 12px;color:#fbbf24}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:28px}.box{padding:20px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08)}</style></head><body><div class="wrap"><div class="hero"><h1>${safeName}</h1><p>Modern Portföy Şablonu — EmoçHosting Gerçek Web Sunucusu üzerinde çalışıyor.</p><div class="grid"><div class="box"><h3>Hızlı NVMe</h3><p>Anlık dosya düzenleme ve canlı yayın.</p></div><div class="box"><h3>Özel Alan Adı</h3><p>Port &amp; Alt Alan Adı yönlendirme aktif.</p></div><div class="box"><h3>Güvenlik</h3><p>CORS, IP engelleme ve temel doğrulama.</p></div></div></div></div></body></html>`
    );
  }
  res.json({ ok: true });
});

// ================= ALTYAPI KV & CONFIG =================
router.get('/:id/infra/kv', requireAuth, loadOwnedServer, (req, res) => {
  const p = resolveSafePath(req.instanceDir, 'kv.json');
  const kv = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
  res.json({ kv });
});

router.post('/:id/infra/kv', requireAuth, loadOwnedServer, requirePerm('settings'), (req, res) => {
  const kvObj = req.body?.kv;
  if (!kvObj || typeof kvObj !== 'object' || Array.isArray(kvObj)) {
    return res.status(400).json({ error: 'KV verisi geçerli bir JSON nesnesi olmalıdır' });
  }
  const serialized = JSON.stringify(kvObj, null, 2);
  if (Buffer.byteLength(serialized, 'utf8') > 512 * 1024) {
    return res.status(400).json({ error: 'KV deposu boyutu maksimum 512 KB olabilir' });
  }
  const p = resolveSafePath(req.instanceDir, 'kv.json');
  fs.writeFileSync(p, serialized);
  res.json({ ok: true });
});

router.post('/:id/infra/config', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const { runtime = 'node', entryFile = 'app.js', autoRestart = true } = req.body || {};
    const validRuntime = validateRuntime('altyapi', runtime);
    const defaultEntry = validRuntime === 'python' ? 'app.py' : validRuntime === 'java' ? 'app.jar' : 'app.js';
    const validEntry = validateEntryFile(req.instanceDir, entryFile || defaultEntry, resolveSafePath);
    await db.collection('servers').doc(req.serverDoc.id).update({
      'config.runtime': validRuntime,
      'config.entryFile': validEntry,
      'config.autoRestart': Boolean(autoRestart),
      updatedAt: Date.now(),
    });
    res.json({ ok: true, runtime: validRuntime, entryFile: validEntry });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= DOMAIN SUBDOMAIN ROUTING =================
router.patch('/:id/subdomain', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const clean = String(req.body.subdomain || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/--+/g, '-')
      .replace(/^-|-$/g, '');
    if (clean.length < 3 || clean.length > 32) {
      return res.status(400).json({ error: 'Alt alan adı 3 ile 32 karakter arasında olmalı (a-z, 0-9, -).' });
    }
    const adminSeg = ENV.ADMIN_PATH.replace(/^\//, '').toLowerCase();
    const reserved = new Set(['www', 'api', 'admin', 'panel', 'mail', 'ftp', 'sftp', 'ns1', 'ns2', 'status', adminSeg]);
    if (reserved.has(clean)) {
      return res.status(400).json({ error: 'Bu sistem alt alan adı rezerve edilmiştir.' });
    }

    const dupSnap = await db.collection('servers').where('subdomain', '==', clean).limit(2).get();
    if (dupSnap.docs.some((d) => d.id !== req.serverDoc.id)) {
      return res.status(409).json({ error: `"${clean}.${ENV.DOMAIN_SUFFIX}" başka bir sunucu tarafından kullanılıyor.` });
    }

    const domainAddress = `${clean}.${ENV.DOMAIN_SUFFIX}`;
    await db.collection('servers').doc(req.serverDoc.id).update({
      subdomain: clean,
      domainAddress,
      updatedAt: Date.now(),
    });

    if (req.serverDoc.category === 'web') {
      const p = path.join(req.instanceDir, 'site.config.json');
      try {
        const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
        fs.writeFileSync(p, JSON.stringify({ ...cur, customDomain: domainAddress }, null, 2));
      } catch {}
    }

    await logServerActivity(req.serverDoc.id, {
      actorEmail: req.user.email,
      action: 'DOMAIN_GUNCELLENDI',
      category: 'network',
      details: { domainAddress },
    });

    res.json({ ok: true, subdomain: clean, domainAddress });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ================= ACTIVITY LOGS =================
router.get('/:id/activity', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    const snap = await db
      .collection('servers')
      .doc(req.serverDoc.id)
      .collection('activity_logs')
      .orderBy('createdAt', 'desc')
      .limit(80)
      .get();
    res.json({ logs: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch {
    res.status(500).json({ error: 'Aktivite kayıtları alınamadı' });
  }
});

// ================= AI SERVER DIAGNOSTICS & 1-CLICK FIX =================
router.post('/:id/ai-diagnose', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    const srv = req.serverDoc;
    const dir = req.instanceDir;
    const issues = [];
    const diskUsed = getDirSizeMb(dir);
    const live = getLatestTelemetry().perServer?.[srv.id] || {};
    const consoleEntries = getConsoleHistory(srv.id);
    const consoleText = consoleEntries.slice(-40).map((l) => l.text).join('\n');

    if (srv.expiresAt && srv.expiresAt - Date.now() < 48 * 60 * 60 * 1000) {
      issues.push({
        id: 'expiring-soon',
        severity: 'warning',
        title: 'Paket Süresi Yaklaşıyor',
        detail: 'Sunucunun süresi 48 saat içinde dolacak; veri kaybı veya otomatik askıya alma yaşamamak için süreyi uzatın.',
      });
    }

    if (diskUsed > Number(srv.allocatedDiskMb || 5120) * 0.85) {
      issues.push({
        id: 'disk-high',
        severity: 'warning',
        title: 'Yüksek NVMe Disk Kullanımı',
        detail: `Disk kotasının %${Math.round((diskUsed / Number(srv.allocatedDiskMb || 5120)) * 100)} kadarı dolu (${diskUsed} MB). Gereksiz log veya eski yedekleri temizleyin.`,
      });
    }

    if (Number(live.ramPct || 0) >= 90) {
      issues.push({
        id: 'ram-pressure',
        severity: 'warning',
        title: 'Yüksek Bellek (RAM) Kullanımı',
        detail: `Şu anda tahsisli RAM'in %${live.ramPct} kadarı kullanılıyor (${live.ramUsedMb} MB / ${srv.allocatedRamMb} MB). Ani bellek taşmalarına karşı paket yükseltmesi düşünülebilir.`,
      });
    }

    if (Number(live.cpuPct || 0) >= 90) {
      issues.push({
        id: 'cpu-pressure',
        severity: 'warning',
        title: 'Yüksek İşlemci (CPU) Yükü',
        detail: `Anlık CPU kullanımı %${live.cpuPct} seviyesinde. Yoğun döngü veya eklenti yükünü kontrol edin.`,
      });
    }

    if (/Çökme döngüsü algılandı/i.test(consoleText)) {
      issues.push({
        id: 'watchdog-circuit-open',
        severity: 'critical',
        title: 'Watchdog Çökme Döngüsü Koruması Devrede',
        detail: 'Sunucu 3 dakika içinde art arda 5 kez çöktüğü için sonsuz yeniden başlatma durduruldu. Alttaki kritik hataları çözüp sunucuyu manuel başlatın.',
      });
    }

    if (srv.category === 'minecraft') {
      const hasJar =
        fs.existsSync(path.join(dir, 'server.jar')) ||
        fs.existsSync(path.join(dir, '.emoc-launch.json'));
      if (!hasJar) {
        issues.push({
          id: 'missing-jar',
          severity: 'critical',
          title: 'Sunucu Çekirdeği Kurulmamış',
          detail: 'Çalışma dizininde server.jar veya başlatıcı paketi bulunamadı. "Sürüm & Yazılım" sekmesinden EmoçCore veya Paper kurun.',
        });
      }

      const eulaPath = path.join(dir, 'eula.txt');
      const eulaTxt = fs.existsSync(eulaPath) ? fs.readFileSync(eulaPath, 'utf8') : '';
      if (!/eula\s*=\s*true/i.test(eulaTxt)) {
        issues.push({
          id: 'eula-false',
          severity: 'critical',
          title: 'Minecraft EULA Onaylanmamış',
          detail: 'Mojang eula=true olmadan sunucu başlamaz.',
          fixAction: 'accept_eula',
          fixLabel: 'Tek Tıkla EULA Onayla',
        });
      }

      const propsPath = path.join(dir, 'server.properties');
      const props = fs.existsSync(propsPath) ? parsePropertiesText(fs.readFileSync(propsPath, 'utf8')) : {};
      if (props['server-port'] && Number(props['server-port']) !== Number(srv.port)) {
        issues.push({
          id: 'port-mismatch',
          severity: 'warning',
          title: 'Port Senkronizasyon Farkı',
          detail: `server.properties içindeki port (${props['server-port']}) tahsis edilen port (${srv.port}) ile uyuşmuyor.`,
          fixAction: 'sync_port',
          fixLabel: `Portu ${srv.port} Yap`,
        });
      }

      if (Number(props['view-distance'] || 10) >= 10 && Number(srv.allocatedRamMb || 2048) <= 4096) {
        issues.push({
          id: 'high-view-distance',
          severity: 'tip',
          title: 'TPS Performans Önerisi (View Distance)',
          detail: `RAM tahsisiniz ${srv.allocatedRamMb} MB iken view-distance=${props['view-distance']} chunk yükü yaratabilir. 7 değeri TPS'i belirgin artırır.`,
          fixAction: 'optimize_view_distance',
          fixLabel: 'View Distance = 7 Optimize Et',
        });
      }

      if (!(srv.config?.jvmFlags || []).some((f) => f.includes('Aikar') || f.includes('G1NewSizePercent'))) {
        issues.push({
          id: 'aikars-flags',
          severity: 'tip',
          title: "Aikar's JVM Bayrakları Aktif Değil",
          detail: 'Çöp toplayıcı (GC) takılmalarını azaltmak için optimize G1GC bayraklarını uygulayın.',
          fixAction: 'optimize_jvm',
          fixLabel: 'Optimize JVM Bayrakları Uygula',
        });
      }

      const logPath = path.join(dir, 'logs', 'latest.log');
      if (fs.existsSync(logPath)) {
        const logTail = fs.readFileSync(logPath, 'utf8').slice(-16000);
        if (/OutOfMemoryError/i.test(logTail)) {
          issues.push({
            id: 'oom-detected',
            severity: 'critical',
            title: 'latest.log İçinde Bellek (OOM) Hatası Görüldü',
            detail: 'Sunucu bellek sınırına çarpmış. Ağır mod/eklentileri azaltın veya "Yükseltme / Düşürme" menüsünden RAM artırın.',
          });
        }
        if (/FAILED TO BIND TO PORT/i.test(logTail)) {
          issues.push({
            id: 'port-bind-error',
            severity: 'critical',
            title: 'Port Bağlama Hatası Tespit Edildi',
            detail: 'Konsolda port çakışması hatası mevcut; portu otomatik senkronize edip yeniden başlatın.',
            fixAction: 'sync_port',
            fixLabel: 'Portu Senkronize Et',
          });
        }
      }
    } else if (srv.category === 'discord') {
      const envPath = path.join(dir, '.env');
      const envObj = fs.existsSync(envPath) ? parseEnvText(fs.readFileSync(envPath, 'utf8')) : {};
      if (!envObj.DISCORD_TOKEN) {
        issues.push({
          id: 'missing-discord-token',
          severity: 'warning',
          title: 'DISCORD_TOKEN Tanımlı Değil',
          detail: 'Botunuz Discord API ağına bağlanamıyor. Bot Paneli > Token & .env sekmesinden token ekleyin.',
        });
      }

      const runtime = srv.config?.runtime || 'node';
      const entry = srv.config?.entryFile || (runtime === 'python' ? 'bot.py' : 'index.js');
      try {
        const entryFull = resolveSafePath(dir, entry);
        if (!fs.existsSync(entryFull)) {
          issues.push({
            id: 'missing-bot-entry',
            severity: 'critical',
            title: `Giriş Dosyası Bulunamadı (${entry})`,
            detail: 'Başlatılacak bot dosyası mevcut değil; Dosya Yöneticisinden yükleyin veya giriş dosyasını güncelleyin.',
          });
        } else if (runtime === 'node') {
          const entrySrc = fs.readFileSync(entryFull, 'utf8');
          if (/discord\.js/.test(entrySrc) && !fs.existsSync(path.join(dir, 'node_modules', 'discord.js'))) {
            issues.push({
              id: 'missing-discordjs-pkg',
              severity: 'critical',
              title: 'discord.js Paketi Kurulu Değil',
              detail: 'Kodunuz discord.js gerektiriyor ancak node_modules/discord.js henüz kurulmamış.',
              fixAction: 'install_discordjs',
              fixLabel: 'discord.js Paketini Şimdi Kur',
            });
          }
        }
      } catch {}

      if (/TOKEN_INVALID|DisallowedIntents|Used disallowed intents/i.test(consoleText)) {
        issues.push({
          id: 'discord-auth-intent-err',
          severity: 'critical',
          title: 'Discord Token veya Intent Hatası',
          detail: 'Konsol çıktısında geçersiz token veya eksik Privileged Gateway Intent uyarısı tespit edildi. Discord Developer Portal ayarlarınızı doğrulayın.',
        });
      }
    } else if (srv.category === 'web') {
      let siteCfg = {};
      try {
        siteCfg = JSON.parse(fs.readFileSync(path.join(dir, 'site.config.json'), 'utf8'));
      } catch {}

      if (siteCfg.mode !== 'node' && !fs.existsSync(path.join(dir, 'public_html', 'index.html'))) {
        issues.push({
          id: 'missing-web-index',
          severity: 'warning',
          title: 'public_html/index.html Eksik',
          detail: 'Statik site ana sayfası bulunamadı; ziyaretçiler 404 görebilir.',
          fixAction: 'restore_web_starter',
          fixLabel: 'Başlangıç Sayfası Oluştur',
        });
      }
      if (siteCfg.basicAuthEnabled && !siteCfg.basicAuthPass) {
        issues.push({
          id: 'basic-auth-no-pass',
          severity: 'warning',
          title: 'Basic Auth Şifresi Boş',
          detail: 'Temel kimlik doğrulama aktif ancak şifre belirlenmemiş; erişim koruması devreye girmeyecektir.',
        });
      }
      if (siteCfg.mode === 'node') {
        const entry = siteCfg.entryFile || 'app.js';
        try {
          if (!fs.existsSync(resolveSafePath(dir, entry))) {
            issues.push({
              id: 'missing-web-node-entry',
              severity: 'critical',
              title: `Node.js Giriş Dosyası Eksik (${entry})`,
              detail: 'Web uygulaması Node modunda ancak belirtilen giriş dosyası bulunamıyor.',
            });
          }
        } catch {}
      }
    } else if (srv.category === 'altyapi') {
      const runtime = srv.config?.runtime || 'node';
      const defaultEntry = runtime === 'python' ? 'app.py' : runtime === 'java' ? 'app.jar' : 'app.js';
      const entry = srv.config?.entryFile || defaultEntry;
      try {
        if (!fs.existsSync(resolveSafePath(dir, entry))) {
          issues.push({
            id: 'missing-infra-entry',
            severity: 'critical',
            title: `Uygulama Giriş Dosyası Eksik (${entry})`,
            detail: 'Altyapı düğümü için tanımlanan başlatma dosyası çalışma dizininde bulunamadı.',
          });
        }
      } catch {}
      if (/EADDRINUSE/i.test(consoleText)) {
        issues.push({
          id: 'infra-port-in-use',
          severity: 'warning',
          title: 'Port Kullanımda (EADDRINUSE)',
          detail: `Uygulamanızın process.env.PORT (${srv.port}) değişkenini dinlediğinden emin olun.`,
        });
      }
    }

    if (srv.category !== 'web' && !srv.config?.autoRestart) {
      issues.push({
        id: 'watchdog-disabled',
        severity: 'tip',
        title: 'Watchdog Otomatik Kurtarma Kapalı',
        detail: 'Beklenmeyen çökmelerde sunucunun otomatik yeniden başlatılması için Watchdog korumasını etkinleştirin.',
        fixAction: 'enable_autorestart',
        fixLabel: 'Watchdog Korumasını Aç',
      });
    }

    const penaltyMap = { critical: 25, warning: 12, tip: 4 };
    const totalPenalty = issues.reduce((sum, it) => sum + (penaltyMap[it.severity] || 0), 0);
    const healthScore = Math.max(0, Math.min(100, 100 - totalPenalty));
    const grade =
      healthScore >= 90 ? 'Mükemmel' : healthScore >= 70 ? 'İyi' : healthScore >= 45 ? 'Dikkat' : 'Kritik';

    if (issues.length === 0) {
      issues.push({
        id: 'healthy',
        severity: 'ok',
        title: 'Tüm Sistem Kontrolleri Başarılı',
        detail: `${srv.name} yapılandırması, disk kotası (${diskUsed} MB) ve port/domain yönlendirmesi tamamen sağlıklı görünüyor.`,
      });
    }

    const recentConsole = consoleEntries.slice(-12).map((l) => l.text);
    res.json({
      ok: true,
      healthScore,
      grade,
      category: srv.category,
      issues,
      analyzedAt: Date.now(),
      diskUsedMb: diskUsed,
      recentConsole,
    });
  } catch {
    res.status(500).json({ error: 'Sunucu tanılama analizi başarısız' });
  }
});

router.post('/:id/ai-fix', requireAuth, loadOwnedServer, requirePerm('settings'), async (req, res) => {
  try {
    const action = String(req.body.fixAction || '');
    const dir = req.instanceDir;

    if (action === 'accept_eula') {
      fs.writeFileSync(resolveSafePath(dir, 'eula.txt'), 'eula=true\n');
    } else if (action === 'sync_port') {
      const file = resolveSafePath(dir, 'server.properties');
      const props = parsePropertiesText(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
      props['server-port'] = req.serverDoc.port;
      props['query.port'] = req.serverDoc.port;
      fs.writeFileSync(file, serializePropertiesObj(props));
    } else if (action === 'optimize_view_distance') {
      const file = resolveSafePath(dir, 'server.properties');
      const props = parsePropertiesText(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
      props['view-distance'] = '7';
      props['simulation-distance'] = '6';
      fs.writeFileSync(file, serializePropertiesObj(props));
    } else if (action === 'optimize_jvm') {
      const aikar = [
        '-XX:+UseG1GC',
        '-XX:+ParallelRefProcEnabled',
        '-XX:MaxGCPauseMillis=200',
        '-XX:+UnlockExperimentalVMOptions',
        '-XX:+DisableExplicitGC',
        '-XX:G1NewSizePercent=30',
        '-XX:G1MaxNewSizePercent=40',
        '-XX:G1HeapRegionSize=8M',
        '-XX:G1ReservePercent=20',
      ];
      await db.collection('servers').doc(req.serverDoc.id).update({ 'config.jvmFlags': aikar, updatedAt: Date.now() });
    } else if (action === 'enable_autorestart') {
      await db.collection('servers').doc(req.serverDoc.id).update({ 'config.autoRestart': true, updatedAt: Date.now() });
    } else if (action === 'restore_web_starter' && req.serverDoc.category === 'web') {
      const pub = resolveSafePath(dir, 'public_html');
      fs.mkdirSync(pub, { recursive: true });
      const safeName = escapeHtml(req.serverDoc.name);
      fs.writeFileSync(
        path.join(pub, 'index.html'),
        `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeName} | EmoçHosting Web</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif;padding:24px}.card{max-width:600px;padding:36px;border-radius:20px;border:1px solid rgba(245,158,11,.35);background:#111216}</style></head><body><div class="card"><h1>${safeName} Yayında!</h1><p>EmoçHosting Web Sunucusu üzerinde başlangıç sayfanız otomatik oluşturuldu.</p></div></body></html>`
      );
    } else if (action === 'install_discordjs' && req.serverDoc.category === 'discord') {
      await runServerInstallCommand(req.serverDoc.id, 'discord', 'install-discordjs');
    } else {
      return res.status(400).json({ error: 'Geçersiz otomatik düzeltme eylemi' });
    }

    await logServerActivity(req.serverDoc.id, {
      actorEmail: req.user.email,
      action: `AI_FIX_${action.toUpperCase()}`,
      category: 'assistant',
    });

    res.json({ ok: true, message: 'Otomatik optimizasyon başarıyla uygulandı!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/mc/ping', requireAuth, loadOwnedServer, async (req, res) => {
  try {
    const info = await pingMinecraftServer('127.0.0.1', Number(req.serverDoc.port), 1500);
    res.json({ ok: true, ...info, domainAddress: req.serverDoc.domainAddress || `${req.serverDoc.subdomain || req.serverDoc.slug}.${ENV.DOMAIN_SUFFIX}` });
  } catch {
    res.status(500).json({ error: 'Minecraft sunucusu pinglenemedi' });
  }
});

export default router;
