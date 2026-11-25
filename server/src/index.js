import http from 'http';
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Server as SocketIOServer } from 'socket.io';
import { ENV } from './config/env.js';
import { auth, db, seedInitialDataIfNeeded, firebaseStatus, verifyFirebaseToken } from './services/firebase.js';
import { isOwnerEmail, getSystemConfig } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { compressionMiddleware } from './middleware/compress.js';
import {
  escapeHtml,
  isValidDocId,
  parseFiniteNumber,
  getClientIp,
} from './utils/security.js';
import {
  setSocketIO,
  handleStaticWebRequest,
  restoreRunningServersOnBoot,
} from './services/processManager.js';
import { setNotificationIO } from './services/notifications.js';
import { startSchedulers } from './services/scheduler.js';
import { startSftpServer } from './services/sftpServer.js';
import { startMcProxyServer } from './services/mcProxy.js';

import publicRoutes from './routes/public.js';
import authRoutes from './routes/auth.js';
import storeRoutes from './routes/store.js';
import serversRoutes from './routes/servers.js';
import ticketsRoutes from './routes/tickets.js';
import dealsRoutes from './routes/deals.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', ENV.TRUST_PROXY ? 1 : false);

const allowedOrigins = new Set(
  [
    ENV.CLIENT_ORIGIN,
    `http://localhost:${ENV.PORT}`,
    `http://127.0.0.1:${ENV.PORT}`,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ]
    .filter(Boolean)
    .map((o) => o.replace(/\/$/, '').toLowerCase())
);

function isOriginAllowed(origin) {
  if (!origin) return true; // Non-browser clients / same-origin
  return allowedOrigins.has(String(origin).replace(/\/$/, '').toLowerCase());
}

const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(new Error('CORS reddedildi'), false);
    },
    methods: ['GET', 'POST'],
  },
});

setSocketIO(io);
setNotificationIO(io);

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", 'https://apis.google.com', 'https://www.googletagmanager.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'ws:',
          'wss:',
          'https://*.googleapis.com',
          'https://*.firebaseio.com',
          'https://*.firebaseapp.com',
          'https://*.google-analytics.com',
          'https://www.googletagmanager.com',
          'http://localhost:*',
          'http://127.0.0.1:*',
        ],
        frameSrc: ["'self'", 'https://*.firebaseapp.com', 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    maxAge: 600,
  })
);

app.use(express.json({ limit: '2mb' }));

const globalApiLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 240,
  message: 'Çok fazla API isteği gönderildi. Lütfen kısa süre bekleyin.',
});

async function proxyAltyapiHttp(srv, req, res, isSameOriginPath = false) {
  if (srv.category !== 'altyapi') {
    return res.status(404).json({ error: 'Uygulama bulunamadı' });
  }
  if (srv.status !== 'running') {
    return res.status(503).json({ error: 'Uygulama şu anda çalışmıyor' });
  }
  let port;
  try {
    port = parseFiniteNumber(srv.port, { min: 1024, max: 65535, integer: true, label: 'Port' });
  } catch {
    return res.status(502).json({ error: 'Geçersiz uygulama portu' });
  }

  const rawPath = String(req.url || '/');
  const safeRel = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
  const targetUrl = new URL(safeRel, `http://127.0.0.1:${port}`);
  if (targetUrl.hostname !== '127.0.0.1' || Number(targetUrl.port) !== port) {
    return res.status(400).json({ error: 'Geçersiz hedef yol' });
  }

  const headers = {
    'Content-Type': req.headers['content-type'] || 'application/json',
  };
  const fetchOpts = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  };
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
      fetchOpts.body = req.body;
    } else if (Object.keys(req.body).length > 0) {
      fetchOpts.body = JSON.stringify(req.body);
    }
  }

  const proxyRes = await fetch(targetUrl, fetchOpts);
  const text = await proxyRes.text();
  if (isSameOriginPath) {
    res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups allow-modals");
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const contentType = proxyRes.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  return res.status(proxyRes.status).send(text);
}

// Dynamic Virtual-Host Router (<subdomain>.emochost.com or <subdomain>.localhost)
app.use(async (req, res, next) => {
  try {
    const rawHost = String(req.headers.host || '').split(':')[0].toLowerCase().trim();
    if (!rawHost || rawHost === 'localhost' || rawHost === '127.0.0.1' || rawHost === ENV.DOMAIN_SUFFIX) {
      return next();
    }
    const suffix = `.${ENV.DOMAIN_SUFFIX}`;
    let sub = '';
    if (rawHost.endsWith(suffix)) {
      sub = rawHost.slice(0, -suffix.length);
    } else if (rawHost.endsWith('.localhost')) {
      sub = rawHost.slice(0, -'.localhost'.length);
    }
    if (!sub || sub === 'www' || sub === 'api' || !/^[a-z0-9-]{1,80}$/.test(sub)) {
      return next();
    }

    const snap = await db.collection('servers').where('subdomain', '==', sub).limit(1).get();
    const matchDoc = !snap.empty
      ? snap.docs[0]
      : (await db.collection('servers').where('slug', '==', sub).limit(1).get()).docs[0];
    if (!matchDoc) return next();

    const srv = { id: matchDoc.id, ...matchDoc.data() };
    if (srv.category === 'web') {
      return handleStaticWebRequest(srv, req, res, req.url || '/');
    }
    if (srv.category === 'altyapi') {
      return await proxyAltyapiHttp(srv, req, res, false);
    }
    if (srv.category === 'minecraft') {
      const safeName = escapeHtml(srv.name || 'Minecraft Sunucusu');
      const safeDomain = escapeHtml(srv.domainAddress || `${sub}.${ENV.DOMAIN_SUFFIX}`);
      const safePort = escapeHtml(srv.port || '');
      const safeStatus = escapeHtml(srv.status || 'stopped');
      return res.send(
        `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>${safeName} — EmoçHosting Minecraft</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#09090b;color:#f4f4f5;font-family:system-ui,sans-serif"><div style="max-width:520px;padding:32px;border-radius:16px;border:1px solid rgba(255,255,255,0.1);background:#111216"><span style="color:#f59e0b;font-size:12px;font-weight:700;letter-spacing:.08em">EMOÇHOSTİNG MİNECRAFT DÜĞÜMÜ</span><h1 style="margin:10px 0 6px">${safeName}</h1><p style="color:#a1a1aa">Oyuna bağlanmak için Minecraft Çoklu Oyuncu adres çubuğuna bu alan adını yapıştırın:</p><code style="display:block;padding:12px;background:#09090b;border-radius:10px;color:#fbbf24;font-size:16px">${safeDomain}</code><p style="margin-top:14px;color:#71717a;font-size:13px">Doğrudan Port: localhost:${safePort} • Durum: ${safeStatus}</p></div></body></html>`
      );
    }
  } catch {
    // Fall through cleanly without leaking details
  }
  next();
});

function resolvePublicBaseUrl(req) {
  if (process.env.PUBLIC_SITE_URL) {
    return String(process.env.PUBLIC_SITE_URL).replace(/\/$/, '');
  }
  const host = String(req.headers.host || '').trim();
  if (host && !host.endsWith(':5173') && /^[a-zA-Z0-9.-]+(:\d+)?$/.test(host)) {
    const proto = ENV.TRUST_PROXY && req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
    return `${proto === 'https' ? 'https' : 'http'}://${host}`;
  }
  return ENV.CLIENT_ORIGIN.replace(/\/$/, '');
}

function escapeXml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

app.use(compressionMiddleware({ threshold: 1024 }));

// SEO & Security Metadata endpoints (intentionally omits the obscured admin route)
app.get(['/.well-known/security.txt', '/security.txt'], (req, res) => {
  const base = resolvePublicBaseUrl(req);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  res.type('text/plain; charset=utf-8').send(
    `Contact: mailto:destek@emochosting.com\n` +
      `Expires: ${expires}\n` +
      `Preferred-Languages: tr, en\n` +
      `Canonical: ${base}/.well-known/security.txt\n` +
      `Policy: ${base}/gizlilik-politikasi\n`
  );
});

app.get('/robots.txt', (req, res) => {
  const base = resolvePublicBaseUrl(req);
  res.type('text/plain');
  res.send(
    `User-agent: *\nAllow: /\nDisallow: /servers/\nDisallow: /tickets\nDisallow: /account\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const base = resolvePublicBaseUrl(req);
  const lastmod = new Date().toISOString().split('T')[0];
  const urls = [
    { path: '/', priority: '1.0', freq: 'daily' },
    { path: '/packages', priority: '0.9', freq: 'daily' },
    { path: '/deals', priority: '0.85', freq: 'weekly' },
    { path: '/giveaways', priority: '0.85', freq: 'daily' },
    { path: '/sss', priority: '0.8', freq: 'weekly' },
    { path: '/leaderboard', priority: '0.7', freq: 'daily' },
    { path: '/status', priority: '0.7', freq: 'hourly' },
    { path: '/gizlilik-politikasi', priority: '0.5', freq: 'monthly' },
    { path: '/kullanim-sartlari', priority: '0.5', freq: 'monthly' },
    { path: '/cerez-politikasi', priority: '0.4', freq: 'monthly' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${escapeXml(base + u.path)}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.priority}</priority></url>`)
    .join('\n')}\n</urlset>`;
  res.type('application/xml').send(xml);
});

app.get('/llms.txt', async (req, res) => {
  const base = resolvePublicBaseUrl(req);
  let packageLines = '';
  try {
    const pkgSnap = await db.collection('packages').get();
    const pkgs = pkgSnap.docs
      .map((d) => d.data())
      .filter((p) => p.active !== false)
      .sort((a, b) => (a.sortOrder || 99) - (b.sortOrder || 99))
      .slice(0, 12);
    if (pkgs.length > 0) {
      packageLines =
        '\n## Aktif Paketler\n' +
        pkgs
          .map(
            (p) =>
              `- **${p.name}** (${p.category}): ${p.ramMb} MB RAM, ${p.cpuCores} vCPU, ${Math.round((p.diskMb || 0) / 1024)} GB NVMe — ${p.priceMonthly} İnvite/ay`
          )
          .join('\n');
    }
  } catch {}

  res.type('text/markdown; charset=utf-8').send(
    `# EmoçHosting\n\n` +
      `> EmoçHosting; Minecraft (17 çekirdek, Modrinth ve CurseForge), Website (Static/Node.js), Discord Bot (Node.js/Python) ve Altyapı Node sunucularını gerçek süreç yönetimi, SFTP ve otomatik \`*.emochost.com\` domain yönlendirmesiyle sunan bulut barındırma platformudur.\n\n` +
      `## Genel Sayfalar\n` +
      `- [Ana Sayfa](${base}/): Platform özeti ve canlı istatistikler\n` +
      `- [Mağaza & Paketler](${base}/packages): Günlük/Haftalık/Aylık sunucu paketleri\n` +
      `- [Gece Pazarı](${base}/deals): Haftalık %10–%50 indirim kutuları\n` +
      `- [Çekilişler](${base}/giveaways): Topluluk çekilişleri\n` +
      `- [Sıkça Sorulan Sorular](${base}/sss): Teknik destek, SFTP, domain ve KVKK yanıtları\n` +
      `- [Canlı Sistem Durumu](${base}/status): Anlık CPU/RAM ve olay geçmişi\n` +
      `${packageLines}\n\n` +
      `## Yasal & İletişim\n` +
      `- [Gizlilik Politikası ve KVKK](${base}/gizlilik-politikasi)\n` +
      `- [Hizmet Kullanım Şartları](${base}/kullanim-sartlari)\n` +
      `- [Çerez Politikası](${base}/cerez-politikasi)\n`
  );
});

// Reverse Proxy for Hosted Websites (/sites/:slug/*) — sandboxed from main origin tokens
app.use('/sites/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).send('<h1>400 — Geçersiz site adresi</h1>');
    }
    const snap = await db.collection('servers').where('slug', '==', slug).limit(1).get();
    if (snap.empty) {
      return res.status(404).send('<h1>404 — EmoçHosting Site Bulunamadı</h1>');
    }
    const srv = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (srv.category !== 'web') return res.status(404).send('Not a web host');
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return handleStaticWebRequest(srv, req, res, req.url || '/');
  } catch {
    res.status(500).send('Site yüklenirken bir hata oluştu.');
  }
});

// Reverse Proxy for Altyapi Web Endpoints (/apps/:slug/*)
app.use('/apps/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
      return res.status(400).json({ error: 'Geçersiz uygulama adresi' });
    }
    const snap = await db.collection('servers').where('slug', '==', slug).limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Uygulama bulunamadı' });
    const srv = { id: snap.docs[0].id, ...snap.docs[0].data() };
    return await proxyAltyapiHttp(srv, req, res, true);
  } catch {
    res.status(502).json({ error: 'Uygulama şu anda yanıt vermiyor.' });
  }
});

app.use('/api', globalApiLimiter);

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'EmoçHosting',
  });
});

app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/servers', serversRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/deals', dealsRoutes);
app.use(ENV.ADMIN_API_PATH, adminRoutes);

// Explicitly deny unknown /api/* routes before SPA fallback
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API uç noktası bulunamadı.' });
});

// Serve built client in production with strong cache headers & proper 404 on missing static assets
const clientDist = path.resolve(ENV.ROOT_DIR, 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (/[\\/]assets[\\/].+-[a-zA-Z0-9_-]{6,}\.(js|css)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=604800');
        }
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/sites') || req.path.startsWith('/apps')) return next();
    // Return 404 instead of SPA fallback for missing static file extensions
    if (/\.(js|css|map|png|jpe?g|webp|svg|ico|woff2?|json|txt|xml)$/i.test(req.path)) {
      return res.status(404).type('text/plain').send('404 Not Found');
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Socket.IO Real-Time Auth & Rooms
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') return next(new Error('Token gerekli'));
    const decoded = await verifyFirebaseToken(token);
    const email = (decoded.email || '').toLowerCase().trim();
    const isVerifiedForCloud = firebaseStatus.mode === 'emulator' || decoded.email_verified === true;

    let socketIp = ENV.TRUST_PROXY && socket.handshake.headers?.['x-forwarded-for']
      ? String(socket.handshake.headers['x-forwarded-for']).split(',')[0].trim()
      : String(socket.handshake.address || '').trim();
    if (socketIp.startsWith('::ffff:')) socketIp = socketIp.slice(7);

    const ownerCandidate = isOwnerEmail(email) && isVerifiedForCloud;
    if (socketIp && !ownerCandidate) {
      const ipBanSnap = await db.collection('ip_bans').where('ip', '==', socketIp).limit(1).get();
      if (!ipBanSnap.empty) return next(new Error('IP adresi engellenmiş'));
    }

    const uSnap = await db.collection('users').doc(decoded.uid).get();
    if (!uSnap.exists) return next(new Error('Kullanıcı profili bulunamadı'));
    const profile = uSnap.data();

    if (profile.banned && !ownerCandidate) {
      if (!profile.bannedUntil || Date.now() <= profile.bannedUntil) {
        return next(new Error('Hesap yasaklı'));
      }
    }

    const sysCfg = await getSystemConfig();
    const isAdmin = isVerifiedForCloud && (ownerCandidate || (!sysCfg.onlyOwnerAdminMode && profile?.isAdmin === true));
    if (sysCfg.maintenanceMode && !isAdmin) {
      return next(new Error('Sistem bakım modunda'));
    }

    socket.user = { uid: decoded.uid, email, isAdmin };
    next();
  } catch {
    next(new Error('Yetkisiz socket bağlantısı'));
  }
});

io.on('connection', (socket) => {
  socket.join(`user:${socket.user.uid}`);
  socket.join('all');
  if (socket.user.isAdmin) {
    socket.join('admin');
  }

  socket.on('join:server', async (serverId) => {
    try {
      const sid = String(serverId || '').trim();
      if (!isValidDocId(sid)) return;
      const snap = await db.collection('servers').doc(sid).get();
      if (!snap.exists) return;
      const data = snap.data();
      const isOwner = data.ownerUid === socket.user.uid;
      const collab = (data.collaborators || []).find((c) => c.uid === socket.user.uid);
      if (isOwner || collab || socket.user.isAdmin) {
        socket.join(`server:${sid}`);
        if (isOwner || socket.user.isAdmin || collab?.permissions?.includes('console')) {
          socket.join(`server-console:${sid}`);
        }
      }
    } catch {}
  });

  socket.on('leave:server', (serverId) => {
    const sid = String(serverId || '').trim();
    if (!isValidDocId(sid)) return;
    socket.leave(`server:${sid}`);
    socket.leave(`server-console:${sid}`);
  });
});

server.listen(ENV.PORT, ENV.HOST, async () => {
  await seedInitialDataIfNeeded();
  console.log(`\n🦁 EmoçHosting Backend çalışıyor -> http://localhost:${ENV.PORT}`);
  console.log(`🔥 Firebase Modu: ${firebaseStatus.mode} (Proje: ${firebaseStatus.projectId})`);
  startSchedulers(io);
  startSftpServer();
  startMcProxyServer();
  restoreRunningServersOnBoot();
});
