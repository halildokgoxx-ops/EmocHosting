import fs from 'fs';
import path from 'path';
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import archiver from 'archiver';
import { ENV, INSTANCES_DIR, BACKUPS_DIR } from '../config/env.js';
import { db } from './firebase.js';
import { pingMinecraftServer } from './minecraftApi.js';
import { sendDiscordWebhook } from './webhook.js';
import { getDirSizeMb } from './telemetry.js';
import {
  escapeHtml,
  assertSafeDocId,
  timingSafeEqualStr,
  getClientIp,
  validateRuntime,
  validateEntryFile,
  sanitizeJvmFlags,
  validateMinecraftArgsFile,
  buildSafeChildEnv,
  safeExtractZip,
} from '../utils/security.js';

export const activeProcesses = new Map();
const consoleBuffers = new Map();
const webLogBuffers = new Map();
const crashWindows = new Map();
let ioRef = null;

const MAX_CONSOLE_LINES = 250;
const MAX_WEB_LOGS = 150;
const CRASH_WINDOW_MS = 180_000;
const CRASH_LIMIT = 5;

export function clearWatchdogTimer(serverId) {
  const entry = crashWindows.get(serverId);
  if (entry?.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
}

export function setSocketIO(io) {
  ioRef = io;
}

const ALLOWED_SERVER_CATEGORIES = new Set(['minecraft', 'discord', 'web', 'altyapi']);

export function getInstanceDir(category, serverId) {
  const safeId = assertSafeDocId(serverId, 'sunucu kimliği');
  const safeCat = ALLOWED_SERVER_CATEGORIES.has(category) ? category : 'altyapi';
  return path.join(INSTANCES_DIR, safeCat, safeId);
}

export function getServerBackupDir(serverId) {
  const safeId = assertSafeDocId(serverId, 'sunucu kimliği');
  const dir = path.join(BACKUPS_DIR, safeId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveSafePath(baseDir, relPath = '') {
  const raw = String(relPath || '');
  if (raw.includes('\0')) {
    throw new Error('Geçersiz dosya yolu (null byte)');
  }
  const cleaned = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const baseResolved = path.resolve(baseDir);
  const resolved = path.resolve(baseResolved, cleaned);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error('Geçersiz dosya yolu (güvenlik ihlali)');
  }

  // Reject any symlink segment along the relative path (including broken symlinks)
  const relSegments = path.relative(baseResolved, resolved).split(path.sep).filter(Boolean);
  let cur = baseResolved;
  for (const seg of relSegments) {
    cur = path.join(cur, seg);
    try {
      const lst = fs.lstatSync(cur);
      if (lst.isSymbolicLink()) {
        throw new Error('Sembolik bağlantılara (symlink) erişim engellendi');
      }
    } catch (err) {
      if (err.code === 'ENOENT') break;
      throw err;
    }
  }

  // Verify deepest existing ancestor's realpath remains inside baseDir's realpath
  if (fs.existsSync(baseResolved)) {
    const baseReal = fs.realpathSync(baseResolved);
    let checkPath = resolved;
    while (!fs.existsSync(checkPath) && checkPath !== baseResolved) {
      const parent = path.dirname(checkPath);
      if (parent === checkPath) break;
      checkPath = parent;
    }
    if (fs.existsSync(checkPath)) {
      const realAncestor = fs.realpathSync(checkPath);
      if (realAncestor !== baseReal && !realAncestor.startsWith(baseReal + path.sep)) {
        throw new Error('Dizin dışı symlink erişimi reddedildi');
      }
    }
  }

  return resolved;
}

export function appendConsole(serverId, line, stream = 'stdout') {
  if (!consoleBuffers.has(serverId)) consoleBuffers.set(serverId, []);
  const buf = consoleBuffers.get(serverId);
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
    stream,
    text: String(line).replace(/\r?\n$/, ''),
  };
  buf.push(entry);
  if (buf.length > MAX_CONSOLE_LINES) buf.shift();
  if (ioRef) {
    ioRef.to(`server-console:${serverId}`).emit('console:line', { serverId, entry });
  }
}

export function getConsoleHistory(serverId) {
  return consoleBuffers.get(serverId) || [];
}

export function clearConsoleHistory(serverId) {
  consoleBuffers.set(serverId, []);
}

export function appendWebLog(serverId, logEntry) {
  if (!webLogBuffers.has(serverId)) webLogBuffers.set(serverId, []);
  const buf = webLogBuffers.get(serverId);
  buf.unshift(logEntry);
  if (buf.length > MAX_WEB_LOGS) buf.pop();
  if (ioRef) {
    ioRef.to(`server-console:${serverId}`).emit('web:log', { serverId, entry: logEntry });
  }
}

export function getWebLogs(serverId) {
  return webLogBuffers.get(serverId) || [];
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, '0.0.0.0');
  });
}

export async function allocateFreePort(category) {
  const start = category === 'web' || category === 'altyapi' ? ENV.WEB_PORT_START : ENV.ALLOC_PORT_START;
  const end = category === 'web' || category === 'altyapi' ? ENV.WEB_PORT_END : ENV.ALLOC_PORT_END;

  const snap = await db.collection('servers').get();
  const used = new Set(snap.docs.map((d) => Number(d.data().port)).filter(Boolean));

  for (let p = start; p <= end; p++) {
    if (used.has(p)) continue;
    const free = await isPortAvailable(p);
    if (free) return p;
  }
  throw new Error('Kullanılabilir boş port kalmadı');
}

export function parseEnvText(text = '') {
  const result = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) result[key] = val;
  }
  return result;
}

export function serializeEnvObj(obj = {}) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${String(v ?? '').replace(/\r?\n/g, '')}`)
    .join('\n') + '\n';
}

export function parsePropertiesText(text = '') {
  const props = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    props[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return props;
}

export function serializePropertiesObj(props = {}) {
  const lines = ['# EmoçHosting Minecraft server.properties', `# Güncellendi: ${new Date().toISOString()}`];
  for (const [k, v] of Object.entries(props)) {
    lines.push(`${k}=${v}`);
  }
  return lines.join('\n') + '\n';
}

function getDefaultWebHtml(serverName, slug) {
  const safeName = escapeHtml(serverName || 'Web Sitesi');
  const safeSlug = escapeHtml(slug || 'site');
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeName} | EmoçHosting Web</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: radial-gradient(circle at top right, #1d1244, #05070e 60%);
      color: #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 680px;
      width: 100%;
      background: rgba(12, 18, 36, 0.78);
      border: 1px solid rgba(0, 240, 255, 0.25);
      border-radius: 24px;
      padding: 40px;
      box-shadow: 0 0 60px rgba(0, 240, 255, 0.12);
      backdrop-filter: blur(18px);
    }
    .badge {
      display: inline-block;
      padding: 6px 14px;
      border-radius: 999px;
      background: rgba(0, 240, 255, 0.12);
      color: #22d3ee;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      margin-bottom: 18px;
    }
    h1 {
      font-size: 34px;
      background: linear-gradient(90deg, #00f0ff, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    p { color: #94a3b8; line-height: 1.65; margin-bottom: 20px; }
    code {
      display: block;
      background: #060913;
      border: 1px solid rgba(255,255,255,0.08);
      padding: 14px 16px;
      border-radius: 12px;
      color: #67e8f9;
      font-family: Consolas, monospace;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">EMOÇHOSTING CANLI WEB YAYINI</span>
    <h1>${escapeHtml(serverName || 'Web Sitesi')} Yayında!</h1>
    <p>Web siteniz gerçek HTTP sunucusu üzerinden başarıyla yayınlanıyor. Yönetim panelindeki Dosya Yöneticisi ile <strong>public_html/index.html</strong> dosyasını düzenleyebilir veya kendi dosyalarınızı yükleyebilirsiniz.</p>
    <code>Slug: ${escapeHtml(slug || 'site')} • Powered by EmoçHosting NVMe Engine</code>
  </div>
</body>
</html>`;
}

export async function provisionServerWorkspace(server) {
  const dir = getInstanceDir(server.category, server.id);
  fs.mkdirSync(dir, { recursive: true });

  if (server.category === 'minecraft') {
    fs.mkdirSync(path.join(dir, 'plugins'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'world'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'eula.txt'), 'eula=false\n');
    const props = {
      'server-port': server.port,
      motd: `EmoçHosting | ${server.name}`,
      'max-players': server.slotsOrPorts || 50,
      gamemode: 'survival',
      difficulty: 'normal',
      pvp: 'true',
      'online-mode': 'true',
      'view-distance': '10',
      'simulation-distance': '8',
      'white-list': 'false',
      'enable-command-block': 'false',
      'allow-nether': 'true',
      'spawn-protection': '16',
      'level-name': 'world',
      'level-seed': '',
    };
    fs.writeFileSync(path.join(dir, 'server.properties'), serializePropertiesObj(props));
    for (const f of ['ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json']) {
      if (!fs.existsSync(path.join(dir, f))) fs.writeFileSync(path.join(dir, f), '[]\n');
    }
  } else if (server.category === 'web') {
    const pub = path.join(dir, 'public_html');
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, 'index.html'), getDefaultWebHtml(server.name, server.slug || server.id));
    fs.writeFileSync(
      path.join(pub, '404.html'),
      `<body style="background:#05070e;color:#e2e8f0;font-family:sans-serif;display:grid;place-items:center;height:100vh"><div><h1>404</h1><p>Sayfa bulunamadı — ${escapeHtml(server.name)}</p></div></body>`
    );
    fs.writeFileSync(
      path.join(dir, 'site.config.json'),
      JSON.stringify(
        {
          mode: 'static',
          entryFile: 'app.js',
          directoryListing: false,
          corsEnabled: true,
          spaFallback: false,
          basicAuthEnabled: false,
          basicAuthUser: 'admin',
          basicAuthPass: '',
          blockedIps: [],
          customDomain: `${server.subdomain || server.slug || server.id}.${ENV.DOMAIN_SUFFIX}`,
          sslRedirect: false,
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: server.slug || server.id, version: '1.0.0', scripts: { start: 'node app.js' } }, null, 2)
    );
    const safePort = Number.isInteger(Number(server.port)) ? Number(server.port) : 3000;
    const safeAppTitleLiteral = JSON.stringify(escapeHtml(server.name || 'Web App'));
    fs.writeFileSync(
      path.join(dir, 'app.js'),
      `const http = require('http');\nconst port = process.env.PORT || ${safePort};\nconst title = ${safeAppTitleLiteral};\nhttp.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });\n  res.end('<h1>' + title + ' Node.js Web App Aktif!</h1>');\n}).listen(port, () => console.log('Web App dinleniyor:', port));\n`
    );
    fs.writeFileSync(path.join(dir, '.env'), `PORT=${safePort}\nNODE_ENV=production\n`);
  } else if (server.category === 'discord') {
    fs.mkdirSync(path.join(dir, 'commands'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, '.env'),
      `DISCORD_TOKEN=\nCLIENT_ID=\nGUILD_ID=\nPREFIX=!\nBOT_STATUS=EmoçHosting ile 7/24 Aktif\n`
    );
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify(
        {
          name: `bot-${server.slug || server.id}`,
          version: '1.0.0',
          main: 'index.js',
          scripts: { start: 'node index.js' },
          dependencies: {},
        },
        null,
        2
      )
    );
    fs.writeFileSync(
      path.join(dir, 'requirements.txt'),
      `discord.py>=2.4.0\npython-dotenv>=1.0.1\n`
    );
    fs.writeFileSync(
      path.join(dir, 'index.js'),
      `// emoçhosting Discord Bot Başlangıç Dosyası
const token = process.env.DISCORD_TOKEN;
console.log('[Bot] Başlatılıyor... Sunucu:', ${JSON.stringify(server.name)});

if (!token) {
  console.log('[UYARI] .env içinde DISCORD_TOKEN henüz tanımlanmamış! Panel > Token & .env bölümünden token girip botu yeniden başlatın.');
  setInterval(() => {
    console.log('[Bekleme] Token bekleniyor... (' + new Date().toLocaleTimeString('tr-TR') + ')');
  }, 15000);
} else {
  let Discord;
  try {
    Discord = require('discord.js');
  } catch (e) {
    console.error('[HATA] discord.js paketi kurulu değil! Panelden "discord.js Kur" butonuna tıklayın.');
    process.exit(1);
  }
  const { Client, GatewayIntentBits, ActivityType } = Discord;
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  client.once('ready', () => {
    console.log('[BAĞLANDI] Discord bot giriş yaptı:', client.user.tag);
    client.user.setActivity(process.env.BOT_STATUS || 'emoçhosting', { type: ActivityType.Watching });
  });

  client.on('messageCreate', (msg) => {
    if (msg.author.bot) return;
    const prefix = process.env.PREFIX || '!';
    if (msg.content === prefix + 'ping') {
      msg.reply('Pong! Gecikme: ' + client.ws.ping + 'ms (EmoçHosting)');
    }
  });

  client.login(token).catch((err) => {
    console.error('[Giriş Hatası]', err.message);
    process.exit(1);
  });
}
`
    );
    fs.writeFileSync(
      path.join(dir, 'bot.py'),
      `import os, time\nprint("[Python Bot] Başlatılıyor...")\ntoken = os.getenv("DISCORD_TOKEN", "")\nif not token:\n    print("[UYARI] DISCORD_TOKEN boş. .env dosyasından ayarlayın.")\n    while True:\n        time.sleep(15)\n`
    );
  } else {
    // Altyapi
    fs.writeFileSync(path.join(dir, '.env'), `PORT=${server.port}\nAPP_ENV=production\n`);
    fs.writeFileSync(
      path.join(dir, 'kv.json'),
      JSON.stringify({ appName: server.name, initializedAt: new Date().toISOString() }, null, 2)
    );
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: `infra-${server.slug || server.id}`, version: '1.0.0', scripts: { start: 'node app.js' } }, null, 2)
    );
    fs.writeFileSync(
      path.join(dir, 'app.js'),
      `const http = require('http');\nconst fs = require('fs');\nconst port = process.env.PORT || ${server.port};\nconst server = http.createServer((req, res) => {\n  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });\n  res.end(JSON.stringify({ status: 'ok', service: ${JSON.stringify(server.name)}, port, time: new Date().toISOString() }));\n});\nserver.listen(port, () => console.log('[Altyapı] Servis dinleniyor -> http://localhost:' + port));\n`
    );
  }

  return dir;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff2': 'font/woff2',
};

export function handleStaticWebRequest(server, req, res, strippedUrlPath) {
  const startedAt = Date.now();
  const runtime = activeProcesses.get(server.id);
  const currentStatus = runtime?.status || server.status;
  const dir = getInstanceDir('web', server.id);
  const pubDir = path.join(dir, 'public_html');

  let siteCfg = {};
  try {
    siteCfg = JSON.parse(fs.readFileSync(path.join(dir, 'site.config.json'), 'utf8'));
  } catch {}

  const clientIp = getClientIp(req);
  if (Array.isArray(siteCfg.blockedIps) && siteCfg.blockedIps.includes(clientIp)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden - IP Blocked by EmoçHosting Site Firewall');
    return;
  }

  if (siteCfg.corsEnabled !== false) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }

  if (currentStatus === 'paused') {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<body style="background:#05070e;color:#e2e8f0;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center"><div><h1 style="color:#f59e0b">Site Duraklatıldı</h1><p>${escapeHtml(server.name)} geçici olarak duraklatıldı.</p></div></body>`);
    return;
  }
  if (currentStatus !== 'running') {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<body style="background:#05070e;color:#e2e8f0;font-family:sans-serif;display:grid;place-items:center;height:100vh;text-align:center"><div><h1 style="color:#ef4444">Site Çevrimdışı</h1><p>${escapeHtml(server.name)} şu anda kapalı.</p></div></body>`);
    return;
  }

  if (siteCfg.basicAuthEnabled && siteCfg.basicAuthPass) {
    const authHdr = String(req.headers.authorization || '');
    const expected = 'Basic ' + Buffer.from(`${siteCfg.basicAuthUser || 'admin'}:${siteCfg.basicAuthPass}`).toString('base64');
    if (!timingSafeEqualStr(authHdr, expected)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="EmoçHosting Protected Site"' });
      res.end('Yetkilendirme Gerekli');
      return;
    }
  }

  const reqPath = (strippedUrlPath || '/').split('?')[0];
  let targetFile;
  try {
    targetFile = resolveSafePath(pubDir, reqPath === '/' ? 'index.html' : reqPath);
  } catch {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (fs.existsSync(targetFile) && fs.statSync(targetFile).isDirectory()) {
    const idx = path.join(targetFile, 'index.html');
    if (fs.existsSync(idx)) {
      targetFile = idx;
    } else if (siteCfg.directoryListing) {
      const items = fs.readdirSync(targetFile);
      const html = `<html><body style="background:#070b14;color:#e2e8f0;font-family:monospace;padding:24px"><h2>Dizin: ${escapeHtml(reqPath)}</h2><ul>${items
        .map((i) => `<li><a style="color:#22d3ee" href="${encodeURI(path.posix.join(reqPath, i))}">${escapeHtml(i)}</a></li>`)
        .join('')}</ul></body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }
  }

  if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
    if (siteCfg.spaFallback && fs.existsSync(path.join(pubDir, 'index.html'))) {
      targetFile = path.join(pubDir, 'index.html');
    } else {
      const err404 = path.join(pubDir, '404.html');
      const body404 = fs.existsSync(err404) ? fs.readFileSync(err404) : Buffer.from('404 Not Found');
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(body404);
      if (runtime) {
        runtime.requestsCount = (runtime.requestsCount || 0) + 1;
        runtime.bandwidthBytes = (runtime.bandwidthBytes || 0) + body404.length;
      }
      appendWebLog(server.id, {
        time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
        method: req.method,
        path: reqPath,
        status: 404,
        ms: Date.now() - startedAt,
        bytes: body404.length,
        ip: clientIp,
      });
      return;
    }
  }

  const ext = path.extname(targetFile).toLowerCase();
  const data = fs.readFileSync(targetFile);
  res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
  res.end(data);

  if (runtime) {
    runtime.requestsCount = (runtime.requestsCount || 0) + 1;
    runtime.bandwidthBytes = (runtime.bandwidthBytes || 0) + data.length;
  }
  appendWebLog(server.id, {
    time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
    method: req.method,
    path: reqPath,
    status: 200,
    ms: Date.now() - startedAt,
    bytes: data.length,
    ip: clientIp,
  });
}

export async function startServer(serverId, actorEmail = 'system') {
  assertSafeDocId(serverId, 'sunucu kimliği');
  const docSnap = await db.collection('servers').doc(serverId).get();
  if (!docSnap.exists) throw new Error('Sunucu bulunamadı');
  const server = { id: docSnap.id, ...docSnap.data() };
  if (server.status === 'suspended') {
    throw new Error('Bu sunucu askıya alınmış durumda');
  }

  const existing = activeProcesses.get(serverId);
  if (existing && existing.status === 'running' && (existing.proc || existing.httpServer)) {
    return { alreadyRunning: true, status: 'running' };
  }
  clearWatchdogTimer(serverId);

  const dir = getInstanceDir(server.category, serverId);
  if (!fs.existsSync(dir)) {
    await provisionServerWorkspace(server);
  }

  // Check disk quota before start
  const diskUsed = getDirSizeMb(dir);
  if (diskUsed > Number(server.allocatedDiskMb || 5120) * 1.15) {
    throw new Error(`Disk kotası aşıldı (${diskUsed} MB / ${server.allocatedDiskMb} MB)`);
  }

  const runtimeEntry = {
    serverId,
    category: server.category,
    status: 'running',
    pid: null,
    proc: null,
    httpServer: null,
    startedAt: Date.now(),
    requestsCount: existing?.requestsCount || 0,
    bandwidthBytes: existing?.bandwidthBytes || 0,
    mcInfo: null,
    pingTimer: null,
    manualStop: false,
  };

  if (server.category === 'web') {
    let siteCfg = {};
    try {
      siteCfg = JSON.parse(fs.readFileSync(path.join(dir, 'site.config.json'), 'utf8'));
    } catch {}

    if (siteCfg.mode === 'node') {
      const rawEnv = fs.existsSync(path.join(dir, '.env')) ? parseEnvText(fs.readFileSync(path.join(dir, '.env'), 'utf8')) : {};
      const portNum = parseInt(server.port, 10);
      if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
        throw new Error('Geçersiz sunucu portu');
      }
      const envVars = buildSafeChildEnv(dir, rawEnv, { PORT: String(portNum) });
      const entryFile = validateEntryFile(dir, siteCfg.entryFile || 'app.js', resolveSafePath);
      const proc = spawn(ENV.NODE_PATH, [`--max-old-space-size=${Math.max(128, Number(server.allocatedRamMb || 512))}`, entryFile], {
        cwd: dir,
        env: envVars,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      attachChildProcessHandlers(server, runtimeEntry, proc);
    } else if (existing?.httpServer) {
      // Resume already-listening static web server after pause
      existing.status = 'running';
      existing.manualStop = false;
      existing.pausedAfterStop = false;
      await db.collection('servers').doc(serverId).update({
        status: 'running',
        lastStartedBy: actorEmail,
        updatedAt: Date.now(),
      });
      if (ioRef) {
        ioRef.to(`server:${serverId}`).emit('server:status', { serverId, status: 'running', pid: null });
      }
      appendConsole(serverId, `[Web Sunucu] Duraklatmadan uyandırıldı: http://localhost:${server.port}`, 'system');
      return { status: 'running', resumed: true };
    } else {
      const httpSrv = http.createServer((req, res) => handleStaticWebRequest(server, req, res, req.url));
      await new Promise((resolve, reject) => {
        httpSrv.once('error', reject);
        httpSrv.listen(server.port, '0.0.0.0', () => resolve());
      });
      runtimeEntry.httpServer = httpSrv;
      runtimeEntry.webMemMb = 18;
      appendConsole(serverId, `[Web Sunucu] Yayında: http://localhost:${server.port} ve /sites/${server.slug || serverId}/`, 'system');
    }
  } else if (server.category === 'minecraft') {
    // Avoid port conflict with EmoçHosting SNI proxy port (25565)
    if (Number(server.port) === ENV.MC_PROXY_PORT) {
      const safePort = await allocateFreePort('minecraft');
      server.port = safePort;
      await db.collection('servers').doc(serverId).update({ port: safePort });
      const propsPath = path.join(dir, 'server.properties');
      if (fs.existsSync(propsPath)) {
        const cur = fs.readFileSync(propsPath, 'utf8');
        fs.writeFileSync(propsPath, cur.replace(/server-port=\d+/g, `server-port=${safePort}`));
      }
    }

    const jarPath = path.join(dir, 'server.jar');
    const launchJsonPath = path.join(dir, '.emoc-launch.json');
    let launchMeta = null;
    if (fs.existsSync(launchJsonPath)) {
      try {
        launchMeta = JSON.parse(fs.readFileSync(launchJsonPath, 'utf8'));
      } catch {}
    }

    if (!fs.existsSync(jarPath) && !launchMeta?.argsFile) {
      throw new Error('server.jar bulunamadı! Lütfen Minecraft Paneli > Sürüm & Yazılım sekmesinden sunucu çekirdeği kurun.');
    }
    const eulaPath = path.join(dir, 'eula.txt');
    const eulaTxt = fs.existsSync(eulaPath) ? fs.readFileSync(eulaPath, 'utf8') : '';
    if (!/eula\s*=\s*true/i.test(eulaTxt)) {
      throw new Error('Minecraft EULA kabul edilmemiş! Sürüm & Yazılım sekmesinden EULA onayını aktif edin.');
    }
    const maxRam = Math.max(512, Number(server.allocatedRamMb || 2048));
    const minRam = Math.max(256, Math.floor(maxRam / 2));
    const customFlags = sanitizeJvmFlags(server.config?.jvmFlags);
    const safeArgsFile = launchMeta?.argsFile
      ? validateMinecraftArgsFile(dir, launchMeta.argsFile, resolveSafePath)
      : null;
    const args = safeArgsFile
      ? [`-Xms${minRam}M`, `-Xmx${maxRam}M`, ...customFlags, `@${safeArgsFile}`, 'nogui']
      : [`-Xms${minRam}M`, `-Xmx${maxRam}M`, ...customFlags, '-jar', 'server.jar', 'nogui'];

    appendConsole(serverId, `[Minecraft] Başlatılıyor (Java 21 • RAM: ${minRam}M-${maxRam}M • Port: ${server.port} • Domain: ${server.domainAddress || (server.subdomain || server.slug) + '.' + ENV.DOMAIN_SUFFIX})...`, 'system');
    const proc = spawn(ENV.JAVA_PATH, args, { cwd: dir, env: buildSafeChildEnv(dir, {}), stdio: ['pipe', 'pipe', 'pipe'] });
    attachChildProcessHandlers(server, runtimeEntry, proc);

    runtimeEntry.pingTimer = setInterval(async () => {
      if (runtimeEntry.status !== 'running') return;
      const info = await pingMinecraftServer('127.0.0.1', Number(server.port));
      runtimeEntry.mcInfo = info;
    }, 5000);
  } else if (server.category === 'discord') {
    const botRuntime = validateRuntime('discord', server.config?.runtime || 'node');
    const entryFile = validateEntryFile(dir, server.config?.entryFile || (botRuntime === 'python' ? 'bot.py' : 'index.js'), resolveSafePath);
    const envPath = path.join(dir, '.env');
    const rawEnv = fs.existsSync(envPath) ? parseEnvText(fs.readFileSync(envPath, 'utf8')) : {};
    const envVars = buildSafeChildEnv(dir, rawEnv);
    const bin = botRuntime === 'python' ? ENV.PYTHON_PATH : ENV.NODE_PATH;
    const args = botRuntime === 'python' ? ['-u', entryFile] : [`--max-old-space-size=${Math.max(256, Number(server.allocatedRamMb || 512))}`, entryFile];

    appendConsole(serverId, `[Discord Bot] Başlatılıyor (${botRuntime} ${entryFile})...`, 'system');
    const proc = spawn(bin, args, { cwd: dir, env: envVars, stdio: ['pipe', 'pipe', 'pipe'] });
    attachChildProcessHandlers(server, runtimeEntry, proc);
  } else {
    // Altyapi
    const appRuntime = validateRuntime('altyapi', server.config?.runtime || 'node');
    const defaultEntry = appRuntime === 'python' ? 'app.py' : appRuntime === 'java' ? 'app.jar' : 'app.js';
    const entryFile = validateEntryFile(dir, server.config?.entryFile || defaultEntry, resolveSafePath);
    const portNum = parseInt(server.port, 10);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      throw new Error('Geçersiz sunucu portu');
    }
    const envPath = path.join(dir, '.env');
    const rawEnv = fs.existsSync(envPath) ? parseEnvText(fs.readFileSync(envPath, 'utf8')) : {};
    const envVars = buildSafeChildEnv(dir, rawEnv, { PORT: String(portNum) });
    const bin = appRuntime === 'python' ? ENV.PYTHON_PATH : appRuntime === 'java' ? ENV.JAVA_PATH : ENV.NODE_PATH;
    const args =
      appRuntime === 'java'
        ? [`-Xmx${Math.max(256, Number(server.allocatedRamMb || 1024))}M`, '-jar', entryFile]
        : appRuntime === 'python'
        ? ['-u', entryFile]
        : [`--max-old-space-size=${Math.max(256, Number(server.allocatedRamMb || 512))}`, entryFile];

    appendConsole(serverId, `[Altyapı] Başlatılıyor (${appRuntime} ${entryFile})...`, 'system');
    const proc = spawn(bin, args, { cwd: dir, env: envVars, stdio: ['pipe', 'pipe', 'pipe'] });
    attachChildProcessHandlers(server, runtimeEntry, proc);
  }

  activeProcesses.set(serverId, runtimeEntry);
  await db.collection('servers').doc(serverId).update({
    status: 'running',
    lastStartedBy: actorEmail,
    updatedAt: Date.now(),
  });

  if (ioRef) {
    ioRef.to(`server:${serverId}`).emit('server:status', { serverId, status: 'running', pid: runtimeEntry.pid });
  }
  return { status: 'running', pid: runtimeEntry.pid };
}

function attachChildProcessHandlers(server, runtimeEntry, proc) {
  runtimeEntry.proc = proc;
  runtimeEntry.pid = proc.pid;

  proc.stdout.on('data', (chunk) => {
    const lines = chunk.toString('utf8').split(/\r?\n/);
    for (const l of lines) {
      if (l.trim()) appendConsole(server.id, l, 'stdout');
    }
  });

  proc.stderr.on('data', (chunk) => {
    const lines = chunk.toString('utf8').split(/\r?\n/);
    for (const l of lines) {
      if (l.trim()) appendConsole(server.id, l, 'stderr');
    }
  });

  proc.on('exit', async (code, signal) => {
    if (runtimeEntry.pingTimer) clearInterval(runtimeEntry.pingTimer);
    const wasManual = runtimeEntry.manualStop;
    const targetStatus = runtimeEntry.pausedAfterStop ? 'paused' : 'stopped';
    runtimeEntry.status = targetStatus;
    runtimeEntry.proc = null;
    runtimeEntry.pid = null;

    appendConsole(server.id, `[Sistem] Süreç sonlandı (Kod: ${code ?? 'null'}, Sinyal: ${signal ?? 'none'})`, 'system');

    try {
      await db.collection('servers').doc(server.id).update({ status: targetStatus, updatedAt: Date.now() });
    } catch {}

    if (ioRef) {
      ioRef.to(`server:${server.id}`).emit('server:status', { serverId: server.id, status: targetStatus, pid: null });
    }

    if (!wasManual && code !== 0 && server.config?.autoRestart) {
      const cfgSnap = await db.collection('system_config').doc('global').get();
      if (!cfgSnap.exists || cfgSnap.data()?.autoRestartCrashed !== false) {
        const now = Date.now();
        const uptimeMs = now - (runtimeEntry.startedAt || now);
        const crashState = crashWindows.get(server.id) || { timestamps: [], timer: null };
        if (uptimeMs > 120_000) {
          crashState.timestamps = [];
        }
        crashState.timestamps = crashState.timestamps.filter((t) => now - t < CRASH_WINDOW_MS);
        crashState.timestamps.push(now);

        if (crashState.timestamps.length >= CRASH_LIMIT) {
          crashWindows.set(server.id, crashState);
          appendConsole(
            server.id,
            `[Watchdog] Çökme döngüsü algılandı (3 dk içinde ${CRASH_LIMIT} hata). Sonsuz döngüyü önlemek için otomatik yeniden başlatma durduruldu; AI Teşhis sekmesini çalıştırın.`,
            'stderr'
          );
          sendDiscordWebhook({
            title: 'Watchdog Çökme Döngüsü Durduruldu',
            description: `**${server.name}** (${server.category}) art arda ${CRASH_LIMIT} kez çöktü (Son kod: ${code}). Manuel müdahale bekleniyor.`,
            color: 0xef4444,
          });
          return;
        }

        const delayMs = Math.min(60_000, 4000 * Math.pow(2, crashState.timestamps.length - 1));
        appendConsole(
          server.id,
          `[Watchdog] Beklenmeyen kapanma algılandı (Deneme ${crashState.timestamps.length}/${CRASH_LIMIT - 1}), ${Math.round(delayMs / 1000)} saniye içinde yeniden başlatılıyor...`,
          'system'
        );
        sendDiscordWebhook({
          title: 'Sunucu Çökme & Watchdog Kurtarma',
          description: `**${server.name}** (${server.category}) beklenmeyen çıkış yaptı (Kod: ${code}). ${Math.round(delayMs / 1000)}sn içinde yeniden başlatılıyor.`,
          color: 0xf59e0b,
        });
        if (crashState.timer) clearTimeout(crashState.timer);
        crashState.timer = setTimeout(() => {
          crashState.timer = null;
          startServer(server.id, 'watchdog').catch((err) => appendConsole(server.id, '[Watchdog Hatası] ' + err.message, 'stderr'));
        }, delayMs);
        crashWindows.set(server.id, crashState);
      }
    }
  });
}

export async function stopServer(serverId, { pause = false, forceKill = false, skipDb = false } = {}) {
  clearWatchdogTimer(serverId);
  const runtime = activeProcesses.get(serverId);
  const nextStatus = pause ? 'paused' : 'stopped';

  if (runtime) {
    runtime.manualStop = true;
    runtime.pausedAfterStop = pause;
    if (runtime.pingTimer) clearInterval(runtime.pingTimer);

    if (runtime.httpServer) {
      if (!pause) {
        await new Promise((r) => runtime.httpServer.close(() => r()));
        runtime.httpServer = null;
      }
      runtime.status = nextStatus;
    }

    if (runtime.proc && !runtime.proc.killed) {
      if (forceKill) {
        runtime.proc.kill('SIGKILL');
      } else if (runtime.category === 'minecraft') {
        try {
          runtime.proc.stdin.write('stop\n');
          setTimeout(() => {
            if (runtime.proc && !runtime.proc.killed) runtime.proc.kill('SIGTERM');
          }, 8000);
        } catch {
          runtime.proc.kill('SIGTERM');
        }
      } else {
        runtime.proc.kill('SIGTERM');
        setTimeout(() => {
          if (runtime.proc && !runtime.proc.killed) runtime.proc.kill('SIGKILL');
        }, 4000);
      }
      runtime.status = nextStatus;
    } else if (!runtime.httpServer) {
      runtime.status = nextStatus;
    }
  }

  if (!skipDb) {
    await db.collection('servers').doc(serverId).update({ status: nextStatus, updatedAt: Date.now() });
  }
  appendConsole(serverId, pause ? '[Sistem] Sunucu duraklatıldı.' : '[Sistem] Sunucu durduruldu.', 'system');
  if (ioRef) {
    ioRef.to(`server:${serverId}`).emit('server:status', { serverId, status: nextStatus, pid: null });
  }
  return { status: nextStatus };
}

export async function restartServer(serverId, actorEmail = 'system') {
  await stopServer(serverId, { pause: false, forceKill: false });
  await new Promise((r) => setTimeout(r, 1500));
  return startServer(serverId, actorEmail);
}

export function sendConsoleCommand(serverId, command) {
  const runtime = activeProcesses.get(serverId);
  if (!runtime || !runtime.proc || runtime.status !== 'running') {
    throw new Error('Komut göndermek için sunucunun aktif çalışıyor olması gerekir');
  }
  appendConsole(serverId, `> ${command}`, 'input');
  runtime.proc.stdin.write(command + '\n');
  return { sent: true };
}

export function runServerInstallCommand(serverId, category, cmdStr) {
  return new Promise((resolve, reject) => {
    const dir = getInstanceDir(category, serverId);
    let bin;
    let args;
    if (cmdStr === 'npm-install') {
      bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      args = ['install', '--no-audit', '--no-fund'];
    } else if (cmdStr === 'install-discordjs') {
      bin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      args = ['install', 'discord.js', 'dotenv', '--no-audit', '--no-fund'];
    } else if (cmdStr === 'pip-install') {
      bin = ENV.PYTHON_PATH;
      args = ['-m', 'pip', 'install', '-r', 'requirements.txt'];
    } else {
      return reject(new Error('Desteklenmeyen kurulum komutu'));
    }

    appendConsole(serverId, `[Kurulum] Çalıştırılıyor: ${bin} ${args.join(' ')}`, 'system');
    const child = spawn(bin, args, {
      cwd: dir,
      env: buildSafeChildEnv(dir, {}, {
        npm_config_cache: path.join(dir, '.npm-cache'),
        PIP_CACHE_DIR: path.join(dir, '.pip-cache'),
      }),
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => appendConsole(serverId, d.toString('utf8'), 'stdout'));
    child.stderr.on('data', (d) => appendConsole(serverId, d.toString('utf8'), 'stderr'));
    child.on('exit', (code) => {
      appendConsole(serverId, `[Kurulum] Tamamlandı (Kod: ${code})`, 'system');
      if (code === 0) resolve({ ok: true });
      else reject(new Error(`Kurulum başarısız (Kod ${code})`));
    });
  });
}

export async function createServerBackupZip(server, note = '') {
  const srcDir = getInstanceDir(server.category, server.id);
  const backupDir = getServerBackupDir(server.id);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${stamp}.zip`;
  const outPath = path.join(backupDir, filename);

  await new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outPath);
    const archive = archiver('zip', { zlib: { level: 6 } });
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', {
      cwd: srcDir,
      ignore: ['node_modules/**', '.git/**'],
      dot: true,
      followSymlinks: false,
    });
    archive.finalize();
  });

  const stat = fs.statSync(outPath);
  const meta = {
    filename,
    sizeMb: Number((stat.size / (1024 * 1024)).toFixed(2)),
    note,
    createdAt: Date.now(),
  };
  await db.collection('servers').doc(server.id).collection('backups').doc(filename).set(meta);
  return meta;
}

export async function listServerBackups(serverId) {
  const backupDir = getServerBackupDir(serverId);
  const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.zip'));
  return files
    .map((f) => {
      const st = fs.statSync(path.join(backupDir, f));
      return {
        filename: f,
        sizeMb: Number((st.size / (1024 * 1024)).toFixed(2)),
        createdAt: st.mtimeMs,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function restoreServerBackupZip(server, filename) {
  const runtime = activeProcesses.get(server.id);
  if (runtime && runtime.status === 'running') {
    throw new Error('Yedekten geri yüklemeden önce sunucuyu durdurmalısınız.');
  }
  const backupPath = resolveSafePath(getServerBackupDir(server.id), filename);
  if (!fs.existsSync(backupPath)) throw new Error('Yedek dosyası bulunamadı');
  const targetDir = getInstanceDir(server.category, server.id);
  const maxQuotaBytes = Math.max(50, Number(server.allocatedDiskMb || 5120)) * 1024 * 1024;
  safeExtractZip(backupPath, targetDir, {
    resolveSafePathFn: resolveSafePath,
    maxEntries: 8000,
    maxTotalBytes: maxQuotaBytes,
    maxFileBytes: Math.min(200 * 1024 * 1024, maxQuotaBytes),
  });
  appendConsole(server.id, `[Yedekleme] ${filename} başarıyla geri yüklendi.`, 'system');
  return { restored: true, filename };
}

export async function deleteServerBackupZip(serverId, filename) {
  const backupPath = resolveSafePath(getServerBackupDir(serverId), filename);
  if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
  await db.collection('servers').doc(serverId).collection('backups').doc(filename).delete().catch(() => {});
  return { deleted: true };
}

export async function deleteServerWorkspace(server) {
  await stopServer(server.id, { forceKill: true, skipDb: true }).catch(() => {});
  const dir = getInstanceDir(server.category, server.id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  const bDir = getServerBackupDir(server.id);
  if (fs.existsSync(bDir)) fs.rmSync(bDir, { recursive: true, force: true });
  activeProcesses.delete(server.id);
}

export async function restoreRunningServersOnBoot() {
  try {
    const snap = await db.collection('servers').where('status', '==', 'running').get();
    for (const doc of snap.docs) {
      startServer(doc.id, 'boot-recovery').catch((err) => {
        console.warn(`[Boot] Sunucu ${doc.id} yeniden başlatılamadı:`, err.message);
        db.collection('servers').doc(doc.id).update({ status: 'stopped' }).catch(() => {});
      });
    }
  } catch (err) {
    console.warn('[Boot] Running servers restore skipped:', err.message);
  }
}
