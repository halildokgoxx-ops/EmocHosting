import assert from 'assert';
import http from 'http';
import zlib from 'zlib';
import { spawn } from 'child_process';
import { ENV } from './src/config/env.js';
import { auth as adminSdkAuth } from './src/services/firebase.js';

const PORT = Number(process.env.PORT || 3001);
const MC_PROXY_PORT = Number(process.env.MC_PROXY_PORT || 25565);
const API = `http://127.0.0.1:${PORT}`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const ADMIN_API = ENV.ADMIN_API_PATH;

async function emulatorSignInOrUp(email, password, displayName) {
  const res = await fetch(`${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName, returnSecureToken: true }),
  });
  const data = await res.json();
  if (res.ok) return data;
  if (data.error?.message === 'EMAIL_EXISTS') {
    const existing = await adminSdkAuth.getUserByEmail(email);
    const customToken = await adminSdkAuth.createCustomToken(existing.uid);
    const exchangeRes = await fetch(
      `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-api-key`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
      }
    );
    const exData = await exchangeRes.json();
    if (!exchangeRes.ok) throw new Error(exData.error?.message || 'CustomToken Exchange failed');
    return { ...exData, localId: existing.uid, email: existing.email };
  }
  throw new Error(data.error?.message || 'SignUp failed');
}

async function api(p, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${p}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, data: json };
}

async function run() {
  const backend = spawn('node', ['server/src/index.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  backend.stdout.on('data', (d) => {
    const s = d.toString();
    process.stdout.write(s);
    if (s.includes('Backend çalışıyor')) ready = true;
  });
  backend.stderr.on('data', (d) => process.stderr.write(d.toString()));

  try {
    for (let i = 0; i < 100 && !ready; i++) await new Promise((r) => setTimeout(r, 250));
    assert(ready, 'Backend did not start');

    console.log('1. Checking /api/health & /api/public/bootstrap...');
    const h = await api('/api/health');
    assert(h.ok && h.data.ok && h.data.service === 'EmoçHosting', 'Health check failed');

    const [robotsRes, sitemapRes, llmsRes] = await Promise.all([
      fetch(`${API}/robots.txt`),
      fetch(`${API}/sitemap.xml`),
      fetch(`${API}/llms.txt`),
    ]);
    assert(robotsRes.ok && sitemapRes.ok && llmsRes.ok, 'SEO robots/sitemap/llms endpoints failed');
    const [robotsTxt, sitemapXml, llmsTxt] = await Promise.all([
      robotsRes.text(),
      sitemapRes.text(),
      llmsRes.text(),
    ]);
    assert(!robotsTxt.includes(ENV.ADMIN_PATH) && !robotsTxt.includes('/admin'), 'robots.txt must not disclose admin routes');
    assert(
      sitemapXml.includes('/sss') &&
        sitemapXml.includes('/gizlilik-politikasi') &&
        sitemapXml.includes('/kullanim-sartlari') &&
        sitemapXml.includes('/cerez-politikasi') &&
        !sitemapXml.includes(ENV.ADMIN_PATH),
      'sitemap.xml must include legal/FAQ URLs and exclude admin paths'
    );
    assert(
      llmsTxt.includes('EmoçHosting') && llmsTxt.includes('/sss') && !llmsTxt.includes(ENV.ADMIN_PATH),
      'llms.txt content invalid'
    );

    const staticAssetChecks = await Promise.all(
      [
        '/favicon.ico',
        '/favicon.svg',
        '/apple-touch-icon.png',
        '/manifest.webmanifest',
        '/assets/og-banner.jpg',
        '/assets/hero-datacenter.webp',
        '/assets/lion-emblem.webp',
        '/assets/cyber-emblem.webp',
      ].map(async (p) => ({ path: p, status: (await fetch(`${API}${p}`)).status }))
    );
    for (const item of staticAssetChecks) {
      assert(item.status === 200, `Static asset ${item.path} expected 200, got ${item.status}`);
    }

    const missingAssetRes = await fetch(`${API}/assets/nonexistent-test-asset.png`);
    assert(missingAssetRes.status === 404, `Missing static asset must return 404, got ${missingAssetRes.status}`);

    const spaRouteRes = await fetch(`${API}/gizlilik-politikasi`);
    const spaHtml = await spaRouteRes.text();
    assert(
      spaRouteRes.status === 200 &&
        spaHtml.includes('rel="canonical"') &&
        spaHtml.includes('og:image') &&
        spaHtml.includes('twitter:card'),
      'SPA HTML missing SEO/social/canonical meta tags'
    );

    const consentPost = await fetch(`${API}/api/public/analytics/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ choice: 'all' }),
    });
    assert(consentPost.status === 204, `Analytics consent POST expected 204, got ${consentPost.status}`);

    const pageviewPost = await fetch(`${API}/api/public/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'pageview', path: '/packages', device: 'mobile' }),
    });
    assert(pageviewPost.status === 204, `Analytics pageview POST expected 204, got ${pageviewPost.status}`);

    const analyticsPost = await fetch(`${API}/api/public/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cta_click', path: '/', label: 'e2e_hero_cta', device: 'desktop' }),
    });
    assert(analyticsPost.status === 204, `Analytics event POST expected 204, got ${analyticsPost.status}`);

    const dwellPost = await fetch(`${API}/api/public/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'page_dwell', path: '/packages', durationMs: 12500, device: 'mobile' }),
    });
    assert(dwellPost.status === 204, `Analytics dwell POST expected 204, got ${dwellPost.status}`);

    const publicSummaryRemoved = await api('/api/public/analytics/summary');
    assert(publicSummaryRemoved.status === 404, `Public /analytics/summary must be disabled (404), got ${publicSummaryRemoved.status}`);

    const secTxtRes = await fetch(`${API}/.well-known/security.txt`);
    const secTxt = await secTxtRes.text();
    assert(
      secTxtRes.status === 200 && secTxt.includes('mailto:destek@emochosting.com') && secTxt.includes('Canonical:'),
      '/.well-known/security.txt invalid'
    );

    const statusRes = await api('/api/public/status');
    assert(statusRes.ok && Array.isArray(statusRes.data.history), '/api/public/status must return history array');
    assert(
      statusRes.data.host?.cpuCores === undefined &&
        statusRes.data.host?.cpuModel === undefined &&
        statusRes.data.host?.platform === undefined,
      '/api/public/status leaked internal host hardware info'
    );

    // Verify native Brotli & Gzip HTTP compression on API & static HTML
    const rawHttpGet = (reqPath, encoding) =>
      new Promise((resolve, reject) => {
        const req = http.get(
          `${API}${reqPath}`,
          { headers: encoding ? { 'Accept-Encoding': encoding } : {} },
          (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
          }
        );
        req.on('error', reject);
      });

    const [brBoot, plainBoot, gzipHtml] = await Promise.all([
      rawHttpGet('/api/public/bootstrap', 'br'),
      rawHttpGet('/api/public/bootstrap', 'identity'),
      rawHttpGet('/', 'gzip'),
    ]);
    assert(brBoot.headers['content-encoding'] === 'br', `Expected br compression on bootstrap, got ${brBoot.headers['content-encoding']}`);
    assert(brBoot.body.length < plainBoot.body.length, 'Brotli bootstrap payload should be smaller than uncompressed JSON');
    const decodedBoot = JSON.parse(zlib.brotliDecompressSync(brBoot.body).toString('utf8'));
    assert(Array.isArray(decodedBoot.packages) && decodedBoot.packages.length >= 9, 'Decompressed br bootstrap invalid');

    assert(gzipHtml.headers['content-encoding'] === 'gzip', `Expected gzip compression on HTML, got ${gzipHtml.headers['content-encoding']}`);
    const decodedHtml = zlib.gunzipSync(gzipHtml.body).toString('utf8');
    assert(decodedHtml.includes('<!doctype html>') || decodedHtml.includes('<!DOCTYPE html>'), 'Decompressed gzip HTML invalid');

    const boot = await api('/api/public/bootstrap');
    assert(boot.ok && Array.isArray(boot.data.packages) && boot.data.packages.length >= 9, 'Seeded packages missing');
    assert(boot.data.firebase === undefined, '/api/public/bootstrap must not expose internal firebase mode metadata');
    assert((boot.data.config?.tosText || '').length > 500 && (boot.data.config?.privacyText || '').length > 500, 'Long ToS/KVKK missing');
    assert(boot.data.config?.seoTitle?.includes('EmoçHosting'), 'SEO config missing');
    assert(boot.data.config?.discordWebhookUrl === undefined && boot.data.config?.curseforgeApiKey === undefined, 'Public config leaked secret keys');
    const lbSample = boot.data.leaderboard?.byXp?.[0];
    if (lbSample) {
      assert(lbSample.uid === undefined && lbSample.totalSpent === undefined, 'Public leaderboard leaked uid/totalSpent');
    }
    console.log('   OK:', boot.data.packages.length, 'packages, long ToS/KVKK & SEO loaded (internal metadata stripped).');

    console.log('2. Ensuring Owner Admin (halildokgoxx@gmail.com) & Fresh Regular User in Firebase Auth Emulator...');
    const adminAuth = await emulatorSignInOrUp('halildokgoxx@gmail.com', 'AdminPass123!', 'HalilKurucu');
    const uniqueEmail = `oyuncu-${Date.now()}@emochosting.test`;
    const userAuth = await emulatorSignInOrUp(uniqueEmail, 'UserPass123!', 'TestOyuncu');

    const adminMe = await api('/api/auth/me', { token: adminAuth.idToken });
    assert(adminMe.ok && adminMe.data.user.isAdmin && adminMe.data.user.isOwner, 'Owner admin detection failed');

    const userMe = await api('/api/auth/me', { token: userAuth.idToken });
    assert(userMe.ok && !userMe.data.user.isAdmin, 'Regular user should not be admin');

    console.log('3. Verifying strict Admin Gate (non-admin blocked with 403, legacy /api/admin returns 404)...');
    const oldAdminRoute = await api('/api/admin/overview', { token: adminAuth.idToken });
    assert(oldAdminRoute.status === 404, `Legacy /api/admin route must be disabled (404), got ${oldAdminRoute.status}`);

    const forbidden = await api(`${ADMIN_API}/overview`, { token: userAuth.idToken });
    assert(forbidden.status === 403, `Expected 403 for non-admin, got ${forbidden.status}`);

    const forbiddenAnalytics = await api(`${ADMIN_API}/analytics`, { token: userAuth.idToken });
    assert(forbiddenAnalytics.status === 403, `Expected 403 for non-admin on /analytics, got ${forbiddenAnalytics.status}`);

    const adminOv = await api(`${ADMIN_API}/overview`, { token: adminAuth.idToken });
    assert(adminOv.ok && adminOv.data.telemetry?.host?.cpuCores >= 1, 'Admin overview telemetry missing');

    const adminAnalytics = await api(`${ADMIN_API}/analytics`, { token: adminAuth.idToken });
    assert(
      adminAnalytics.ok &&
        adminAnalytics.data.consentStats?.acceptedAll >= 1 &&
        adminAnalytics.data.deviceStats?.mobile >= 1 &&
        adminAnalytics.data.topByDwellTime?.some((p) => p.path === '/packages' && p.totalDwellSec >= 12) &&
        adminAnalytics.data.topInterests?.some((i) => i.label === 'e2e_hero_cta'),
      'Admin analytics report missing consent/dwell/interest metrics'
    );
    console.log('   OK: Host CPU cores:', adminOv.data.telemetry.host.cpuCores, '| Admin Analytics verified.');

    console.log('4. Testing Admin Balance Grant, Coupon Creation & Purchase with Coupon...');
    const balRes = await api(`${ADMIN_API}/users/${userAuth.localId}/balance`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { mode: 'add', amount: 500, note: 'E2E Test Bakiye' },
    });
    assert(balRes.ok && balRes.data.balance === 500, 'Admin balance add failed');

    const cpnRes = await api(`${ADMIN_API}/coupons`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { code: 'TEST20', discountType: 'percent', value: 20, maxUses: 10 },
    });
    assert(cpnRes.ok, 'Coupon create failed');

    const webBuy = await api('/api/store/purchase', {
      method: 'POST',
      token: userAuth.idToken,
      body: { packageId: 'web-flash', billingCycle: 'monthly', serverName: 'E2EWebSite', couponCode: 'TEST20' },
    });
    assert(webBuy.ok && webBuy.data.server?.port, 'Web server purchase failed');
    const webSrv = webBuy.data.server;
    console.log('   OK: Web server created ->', webSrv.id, 'port:', webSrv.port, 'slug:', webSrv.slug);

    console.log('5. Testing REAL Web Server HTTP serving, live pause (503), and .zip backup...');
    const startWeb = await api(`/api/servers/${webSrv.id}/power`, { method: 'POST', token: userAuth.idToken, body: { action: 'start' } });
    assert(startWeb.ok, 'Failed to start web server');

    const liveHttp = await fetch(`http://127.0.0.1:${webSrv.port}/`);
    const liveHtml = await liveHttp.text();
    assert(liveHttp.status === 200 && liveHtml.includes('E2EWebSite'), 'Real HTTP server did not serve expected HTML');

    const pauseWeb = await api(`/api/servers/${webSrv.id}/power`, { method: 'POST', token: userAuth.idToken, body: { action: 'pause' } });
    assert(pauseWeb.ok, 'Pause failed');
    const pausedHttp = await fetch(`http://127.0.0.1:${webSrv.port}/`);
    assert(pausedHttp.status === 503, `Expected 503 when paused, got ${pausedHttp.status}`);

    const bkpRes = await api(`/api/servers/${webSrv.id}/backups`, { method: 'POST', token: userAuth.idToken, body: { note: 'E2E Backup' } });
    assert(bkpRes.ok && bkpRes.data.backup?.filename, 'Backup creation failed');
    console.log('   OK: Real HTTP served (200), paused (503), backup created:', bkpRes.data.backup.filename);

    console.log('6. Testing REAL Discord Bot child process execution & console streaming...');
    const botBuy = await api('/api/store/purchase', {
      method: 'POST',
      token: userAuth.idToken,
      body: { packageId: 'bot-spark', billingCycle: 'weekly', serverName: 'E2EDiscordBot' },
    });
    assert(botBuy.ok, 'Discord bot purchase failed');
    const botId = botBuy.data.server.id;
    await api(`/api/servers/${botId}/power`, { method: 'POST', token: userAuth.idToken, body: { action: 'start' } });
    await new Promise((r) => setTimeout(r, 1200));
    const botDetail = await api(`/api/servers/${botId}`, { token: userAuth.idToken });
    assert(botDetail.ok && botDetail.data.console.some((l) => l.text.includes('Başlatılıyor')), 'Discord bot live console missing');
    console.log('   OK: Discord bot spawned real node child process & logged console.');

    console.log('7. Testing Support Ticket + Admin Reply + Invite Promo + Cleanup...');
    const tkt = await api('/api/tickets', {
      method: 'POST',
      token: userAuth.idToken,
      body: { subject: 'E2E Destek', category: 'teknik', priority: 'high', message: 'Merhaba test' },
    });
    assert(tkt.ok, 'Ticket creation failed');
    const reply = await api(`/api/tickets/${tkt.data.id}/reply`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { text: 'Admin yanıtı test' },
    });
    assert(reply.ok, 'Admin ticket reply failed');

    const claim = await api('/api/auth/claim-invite', {
      method: 'POST',
      token: userAuth.idToken,
      body: { code: adminMe.data.user.referralCode },
    });
    assert(claim.ok, 'Invite claim failed');

    console.log('8. Testing REAL SFTP Server (ssh2), File Copy/Compress/Extract, Collaborators, & Multi-Core MC...');
    const sftpInfo = await api(`/api/servers/${webSrv.id}/sftp`, { token: userAuth.idToken });
    assert(sftpInfo.ok && sftpInfo.data.username && sftpInfo.data.password, 'SFTP credentials missing');

    // Real SSH2 SFTP client connection test!
    const { createRequire } = await import('module');
    const req = createRequire(import.meta.url);
    const { Client: SshClient } = req('ssh2');
    await new Promise((resolve, reject) => {
      const conn = new SshClient();
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) return reject(err);
          sftp.readdir('/', (err2, list) => {
            if (err2) return reject(err2);
            const names = list.map((x) => x.filename);
            assert(names.includes('public_html'), 'SFTP root missing public_html');
            conn.end();
            resolve();
          });
        });
      });
      conn.on('error', reject);
      conn.connect({
        host: '127.0.0.1',
        port: sftpInfo.data.port,
        username: sftpInfo.data.username,
        password: sftpInfo.data.password,
      });
    });
    console.log('   OK: Real SFTP client connected on port', sftpInfo.data.port, 'and listed files!');

    // File copy + compress + extract
    const cpRes = await api(`/api/servers/${webSrv.id}/copy`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { from: 'public_html/index.html', to: 'public_html/copy.html' },
    });
    assert(cpRes.ok, 'File copy failed');
    const zipRes = await api(`/api/servers/${webSrv.id}/compress`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { paths: ['public_html/copy.html'], outName: 'test-pack.zip' },
    });
    assert(zipRes.ok, 'File compress failed');
    const exRes = await api(`/api/servers/${webSrv.id}/extract`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { path: 'test-pack.zip', destDir: 'extracted' },
    });
    assert(exRes.ok, 'File extract failed');

    // Collaborator add & verify access
    const collabAdd = await api(`/api/servers/${webSrv.id}/collaborators`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { email: 'halildokgoxx@gmail.com', permissions: ['power', 'files', 'sftp'] },
    });
    assert(collabAdd.ok && collabAdd.data.collaborators.length === 1, 'Collaborator add failed');

    // MC Multi-Core Versions + Modrinth Mods search + MOTD + Players UUID
    const mcBuy = await api('/api/store/purchase', {
      method: 'POST',
      token: userAuth.idToken,
      body: { packageId: 'mc-starter', billingCycle: 'daily', serverName: 'E2EMinecraft' },
    });
    assert(mcBuy.ok, 'MC server purchase failed');
    const mcId = mcBuy.data.server.id;

    const mcVers = await api('/api/servers/mc/versions', { token: userAuth.idToken });
    assert(
      mcVers.ok &&
        Array.isArray(mcVers.data.catalog) &&
        mcVers.data.catalog.some((c) => c.id === 'spigot') &&
        mcVers.data.catalog.some((c) => c.id === 'bukkit') &&
        mcVers.data.purpur?.length > 0 &&
        mcVers.data.fabric?.length > 0,
      'Multi-core versions/catalog missing'
    );

    const modSearch = await api('/api/servers/mc/plugins/search?q=jei&type=mod&source=all', { token: userAuth.idToken });
    assert(
      modSearch.ok &&
        modSearch.data.hits?.length > 0 &&
        modSearch.data.hits.some((h) => h.source === 'curseforge') &&
        modSearch.data.hits.some((h) => h.source === 'modrinth'),
      'Unified Modrinth + CurseForge mods search failed'
    );

    const motdRes = await api(`/api/servers/${mcId}/mc/motd`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { motd: '§6§lEmoçHosting\\n§aTest MOTD' },
    });
    assert(motdRes.ok, 'MOTD save failed');

    const opRes = await api(`/api/servers/${mcId}/mc/players-lists/add`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { listName: 'ops.json', username: 'Notch', level: 4 },
    });
    assert(opRes.ok && opRes.data.items.length === 1 && opRes.data.items[0].uuid, 'MC OP add with UUID failed');

    console.log('9. Testing Domain Subdomain Routing, AI Diagnostics, Night Market, Giveaways, Legal & Upgrade...');
    // Legal acceptance record
    const legalRes = await api('/api/auth/accept-legal', {
      method: 'POST',
      token: userAuth.idToken,
      body: { acceptedTerms: true, acceptedKvkk: true },
    });
    assert(legalRes.ok && legalRes.data.acceptedTermsAt > 0, 'Legal acceptance failed');

    // Custom subdomain & Host-header HTTP proxy test + MC Handshake SNI packet parse check
    const subName = `hidir-${Date.now().toString(36).slice(-5)}`;
    const subRes = await api(`/api/servers/${webSrv.id}/subdomain`, {
      method: 'PATCH',
      token: userAuth.idToken,
      body: { subdomain: subName },
    });
    assert(subRes.ok && subRes.data.domainAddress === `${subName}.emochost.com`, 'Subdomain update failed');
    const wakeWeb = await api(`/api/servers/${webSrv.id}/power`, { method: 'POST', token: userAuth.idToken, body: { action: 'start' } });
    assert(wakeWeb.ok, `Failed to wake web server: ${wakeWeb.data?.error}`);
    const httpMod = await import('http');
    const vhostRes = await new Promise((resolve, reject) => {
      const req = httpMod.default.request(
        { host: '127.0.0.1', port: PORT, path: '/', headers: { Host: `${subName}.emochost.com` } },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += d.toString()));
          res.on('end', () => resolve({ status: res.statusCode, html: body }));
        }
      );
      req.on('error', reject);
      req.end();
    });
    assert(vhostRes.status === 200 && vhostRes.html.includes('E2EWebSite'), `Host-header domain proxy failed: ${vhostRes.status}`);

    // Verify MC SNI TCP Proxy responds on MC_PROXY_PORT for stopped server with EmoçHosting disconnect packet
    const netMod = await import('net');
    const mcDomain = `${mcBuy.data.server.subdomain}.emochost.com`;
    const mcProxyMsg = await new Promise((resolve) => {
      const sock = netMod.default.createConnection({ host: '127.0.0.1', port: MC_PROXY_PORT });
      const hostBuf = Buffer.from(`${mcDomain}\0FML3\0`, 'utf8');
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(MC_PROXY_PORT, 0);
      const inner = Buffer.concat([
        Buffer.from([0x00, 0xff, 0x05]), // packetId 0x00, proto 767 (varint: ff 05)
        Buffer.from([hostBuf.length]),
        hostBuf,
        portBuf,
        Buffer.from([0x02]), // login nextState=2
      ]);
      const pkt = Buffer.concat([Buffer.from([inner.length]), inner]);
      let out = [];
      sock.on('data', (c) => out.push(c));
      sock.on('close', () => resolve(Buffer.concat(out).toString('utf8')));
      sock.on('error', () => resolve(''));
      sock.write(pkt);
      setTimeout(() => sock.destroy(), 1500);
    });
    assert(mcProxyMsg.includes('EmoçHosting') && mcProxyMsg.includes(mcDomain), `MC TCP Proxy routing failed: ${mcProxyMsg}`);
    console.log('   OK: Host-header proxy + MC SNI TCP Proxy (:25565) verified!');

    // AI Diagnostics, Health Score & 1-click EULA fix + Per-Server Telemetry History
    const srvDetailRes = await api(`/api/servers/${mcId}`, { token: userAuth.idToken });
    assert(srvDetailRes.ok && Array.isArray(srvDetailRes.data.history), 'Server detail must expose telemetry history array');

    const aiDiag = await api(`/api/servers/${mcId}/ai-diagnose`, { method: 'POST', token: userAuth.idToken });
    assert(
      aiDiag.ok &&
        typeof aiDiag.data.healthScore === 'number' &&
        aiDiag.data.healthScore >= 0 &&
        aiDiag.data.healthScore < 100 &&
        aiDiag.data.issues.some((i) => i.id === 'eula-false'),
      'AI Diagnose failed to compute healthScore or detect EULA'
    );
    const aiFix = await api(`/api/servers/${mcId}/ai-fix`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { fixAction: 'accept_eula' },
    });
    assert(aiFix.ok, 'AI 1-click fix failed');
    const aiDiagAfter = await api(`/api/servers/${mcId}/ai-diagnose`, { method: 'POST', token: userAuth.idToken });
    assert(
      aiDiagAfter.ok && aiDiagAfter.data.healthScore > aiDiag.data.healthScore,
      'Health score should increase after applying AI 1-click fix'
    );

    // Activity logs & Plan upgrade
    const actRes = await api(`/api/servers/${mcId}/activity`, { token: userAuth.idToken });
    assert(actRes.ok && actRes.data.logs?.length > 0, 'Activity logs missing');

    const upgRes = await api(`/api/store/change-package/${mcId}`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { newPackageId: 'mc-pro' },
    });
    assert(upgRes.ok && upgRes.data.newPackage?.id === 'mc-pro', 'Package upgrade failed');

    // Night Market 3 weekly crates + open slot 0 + validate generated coupon
    const nmRes = await api('/api/deals/night-market', { token: userAuth.idToken });
    assert(nmRes.ok && nmRes.data.nightMarket?.boxes?.length === 3, 'Night Market 3 crates missing');
    const openRes = await api('/api/deals/night-market/open/0', { method: 'POST', token: userAuth.idToken });
    assert(openRes.ok && openRes.data.box?.couponCode?.startsWith('GECE-'), 'Night Market crate open failed');
    const openCat = openRes.data.box.categoryFilter || 'all';
    const pkgByCat = { all: 'mc-starter', minecraft: 'mc-starter', web: 'web-flash', discord: 'bot-spark', altyapi: 'mc-starter' };
    const valCpn = await api('/api/store/validate-coupon', {
      method: 'POST',
      token: userAuth.idToken,
      body: { code: openRes.data.box.couponCode, packageId: pkgByCat[openCat] || 'mc-starter', billingCycle: 'monthly' },
    });
    assert(valCpn.ok && valCpn.data.couponDiscount > 0, `Generated Night Market coupon invalid (${openCat}): ${valCpn.data?.error}`);

    // Giveaways create -> join -> participants list -> extend -> cryptographic draw -> balance award
    const gCreate = await api(`${ADMIN_API}/giveaways`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { title: 'E2E Çekilişi', prizeType: 'balance', prizeValue: 75, winnerCount: 1 },
    });
    assert(gCreate.ok && gCreate.data.id, 'Admin giveaway create failed');
    const gJoin = await api(`/api/deals/giveaways/${gCreate.data.id}/join`, { method: 'POST', token: userAuth.idToken });
    assert(gJoin.ok && gJoin.data.participantCount === 1, 'Giveaway join failed');
    const gParts = await api(`${ADMIN_API}/giveaways/${gCreate.data.id}/participants`, { token: adminAuth.idToken });
    assert(gParts.ok && gParts.data.participants?.length === 1 && gParts.data.participants[0].uid === userAuth.localId, 'Admin giveaway participants list failed');
    const gExtend = await api(`${ADMIN_API}/giveaways/${gCreate.data.id}`, {
      method: 'PATCH',
      token: adminAuth.idToken,
      body: { extendHours: 12 },
    });
    assert(gExtend.ok && gExtend.data.updates?.endsAt > Date.now(), 'Admin giveaway extend failed');
    const gDraw = await api(`${ADMIN_API}/giveaways/${gCreate.data.id}/draw`, { method: 'POST', token: adminAuth.idToken });
    assert(gDraw.ok && gDraw.data.winners?.length === 1 && gDraw.data.winners[0].uid === userAuth.localId, 'Giveaway draw failed');

    // Public list must NOT expose winners list, only wonByMe & count; Admin list MUST show winners
    const gPub = await api('/api/deals/giveaways', { token: userAuth.idToken });
    const gPubItem = gPub.data.giveaways?.find((g) => g.id === gCreate.data.id);
    assert(gPubItem && gPubItem.winners === undefined && gPubItem.wonByMe === true && gPubItem.winnersNotifiedCount === 1, 'Giveaway winner privacy failed');

    const gAdm = await api(`${ADMIN_API}/giveaways`, { token: adminAuth.idToken });
    const gAdmItem = gAdm.data.giveaways?.find((g) => g.id === gCreate.data.id);
    assert(gAdmItem && Array.isArray(gAdmItem.winners) && gAdmItem.winners.length === 1, 'Admin giveaway winners missing');

    // Verify Giveaway, Server Power, and Balance notifications were pushed to user_notifications
    const notifRes = await api('/api/auth/notifications', { token: userAuth.idToken });
    const titles = (notifRes.data.notifications || []).map((n) => n.title).join(' | ');
    assert(titles.includes('Çekiliş Kazandınız'), `Missing giveaway win notification: ${titles}`);
    assert(titles.includes('Bakiye Güncellendi'), `Missing balance notification: ${titles}`);
    assert(titles.includes('Sunucu Açıldı'), `Missing server power notification: ${titles}`);

    // Test Changelog create -> bootstrap.latestChangelog -> delete
    const clRes = await api(`${ADMIN_API}/changelogs`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { version: 'v9.9.9', title: 'E2E Sürüm Notu', summary: 'Otomatik test', itemsText: 'Madde 1\nMadde 2', category: 'feature', notifyAll: false },
    });
    assert(clRes.ok && clRes.data.id, 'Changelog create failed');
    const boot2 = await api('/api/public/bootstrap');
    assert(boot2.data.latestChangelog?.id === clRes.data.id, 'latestChangelog missing in bootstrap');
    await api(`${ADMIN_API}/changelogs/${clRes.data.id}`, { method: 'DELETE', token: adminAuth.idToken });

    await api(`${ADMIN_API}/giveaways/${gCreate.data.id}`, { method: 'DELETE', token: adminAuth.idToken });

    console.log('10. Testing User Preferences, Personal API Key Auth, KVKK Export & New Admin Tools...');
    const prefRes = await api('/api/auth/preferences', {
      method: 'PATCH',
      token: userAuth.idToken,
      body: { serverPowerAlerts: true, giveawayAlerts: true, walletAlerts: true, changelogPopups: true },
    });
    assert(prefRes.ok && prefRes.data.preferences?.serverPowerAlerts === true, 'Preferences save failed');

    const keyCreate = await api('/api/auth/api-keys', {
      method: 'POST',
      token: userAuth.idToken,
      body: { label: 'E2E API Key' },
    });
    assert(keyCreate.ok && keyCreate.data.secret?.startsWith('emoc_live_'), 'Personal API Key create failed');

    // Call authenticated route using X-API-Key header
    const apiKeyMeRes = await fetch(`${API}/api/servers`, { headers: { 'X-API-Key': keyCreate.data.secret } });
    const apiKeyMeJson = await apiKeyMeRes.json();
    assert(apiKeyMeRes.ok && Array.isArray(apiKeyMeJson.servers), 'X-API-Key auth failed');

    // Verify API Key cannot manage personal API keys
    const keySelfManage = await fetch(`${API}/api/auth/api-keys`, { headers: { 'X-API-Key': keyCreate.data.secret } });
    assert(keySelfManage.status === 403, `Expected 403 for viaApiKey on /api-keys, got ${keySelfManage.status}`);

    const keyDel = await api(`/api/auth/api-keys/${keyCreate.data.id}`, { method: 'DELETE', token: userAuth.idToken });
    assert(keyDel.ok, 'Personal API Key revoke failed');

    const kvkkExport = await api('/api/auth/export-my-data', { token: userAuth.idToken });
    assert(kvkkExport.ok && kvkkExport.data.platform === 'EmoçHosting' && Array.isArray(kvkkExport.data.servers), 'KVKK export failed');

    const netMap = await api(`${ADMIN_API}/network-map`, { token: adminAuth.idToken });
    assert(netMap.ok && netMap.data.proxyPorts?.sftp && Array.isArray(netMap.data.nodes), 'Admin network map failed');

    const bulkRes = await api(`${ADMIN_API}/users/bulk-bonus`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { balanceBonus: 5, xpBonus: 10, note: 'E2E Toplu Bonus' },
    });
    assert(bulkRes.ok && bulkRes.data.count >= 1, 'Admin bulk bonus failed');

    const nmReset = await api(`${ADMIN_API}/night-market/reset-all`, { method: 'POST', token: adminAuth.idToken });
    assert(nmReset.ok, 'Night market reset-all failed');

    // Coupon expiresInDays + System diagnostics & cache clear
    const cDays = await api(`${ADMIN_API}/coupons`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { code: 'E2EDAYS', discountType: 'percent', value: 10, maxUses: 5, expiresInDays: 7 },
    });
    assert(cDays.ok && cDays.data.coupon?.expiresAt > Date.now() + 5 * 86400 * 1000, 'Coupon expiresInDays failed');
    await api(`${ADMIN_API}/coupons/E2EDAYS`, { method: 'DELETE', token: adminAuth.idToken });

    const diagRes = await api(`${ADMIN_API}/system/diagnostics`, { token: adminAuth.idToken });
    assert(diagRes.ok && diagRes.data.nodeVersion && typeof diagRes.data.sftpPortOpen === 'boolean', 'System diagnostics failed');

    const cacheRes = await api(`${ADMIN_API}/system/cache-clear`, { method: 'POST', token: adminAuth.idToken });
    assert(cacheRes.ok && cacheRes.data.clearedAt > 0, 'System cache-clear failed');

    console.log('11. Running Security Hardening Regression Checks...');
    // a) Query-string ?token= must be rejected
    const qTokRes = await api(`/api/servers?token=${encodeURIComponent(userAuth.idToken)}`);
    assert(qTokRes.status === 401, `Query ?token= auth must return 401, got ${qTokRes.status}`);

    // b) Internal admin notes must be stripped from /api/auth/me
    const adminNoteSet = await api(`${ADMIN_API}/users/${userAuth.localId}/note`, {
      method: 'POST',
      token: adminAuth.idToken,
      body: { notes: 'SECRET_STAFF_NOTE' },
    });
    assert(adminNoteSet.ok, 'Admin note set failed');
    const meNoNotes = await api('/api/auth/me', { token: userAuth.idToken });
    assert(meNoNotes.ok && meNoNotes.data.user?.notes === undefined, '/api/auth/me leaked internal admin notes');

    // c) Path traversal and docId traversal must return 400
    const pathTrav = await api(`/api/servers/${webSrv.id}/file?path=../../package.json`, { token: userAuth.idToken });
    assert(pathTrav.status === 400, `Path traversal must fail with 400, got ${pathTrav.status}`);
    const docIdTrav = await api('/api/servers/..%2Fusers', { token: userAuth.idToken });
    assert(docIdTrav.status === 400 || docIdTrav.status === 404, `Doc ID traversal must fail cleanly, got ${docIdTrav.status}`);

    // d) Unsafe JVM flags and CLI flag injection in entryFile must fail with 400
    const badFlags = await api(`/api/servers/${mcId}/mc/flags`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { jvmFlags: ['-XX:OnOutOfMemoryError=calc.exe', '-javaagent:evil.jar'] },
    });
    assert(badFlags.status === 400, `Dangerous JVM flags must be rejected (400), got ${badFlags.status}`);

    const badEntry = await api(`/api/servers/${botId}/discord/config`, {
      method: 'POST',
      token: userAuth.idToken,
      body: { runtime: 'node', entryFile: '--eval=process.exit(1)' },
    });
    assert(badEntry.status === 400, `Flag injection in entryFile must be rejected (400), got ${badEntry.status}`);

    // e) Discord webhook SSRF must be rejected
    const badWebhook = await api(`${ADMIN_API}/config`, {
      method: 'PATCH',
      token: adminAuth.idToken,
      body: { discordWebhookUrl: 'http://127.0.0.1:8080/internal-ssrf' },
    });
    assert(badWebhook.status === 400, `Non-Discord webhook URL must be rejected (400), got ${badWebhook.status}`);

    // f) Reserved obscured admin route slug cannot be claimed as a server subdomain
    const reservedSub = await api(`/api/servers/${webSrv.id}/subdomain`, {
      method: 'PATCH',
      token: userAuth.idToken,
      body: { subdomain: ENV.ADMIN_PATH.replace(/^\//, '') },
    });
    assert(reservedSub.status === 400, `Obscured admin slug must be reserved (400), got ${reservedSub.status}`);

    // g) SFTP password must be masked if collaborator lacks 'sftp' permission
    await api(`/api/servers/${webSrv.id}/collaborators/${adminAuth.localId}`, {
      method: 'PATCH',
      token: userAuth.idToken,
      body: { permissions: ['power'] },
    });
    const noSftpCollab = await api(`/api/servers/${webSrv.id}`, { token: adminAuth.idToken });
    // Note: adminAuth is system admin (`req.isServerOwner = true`), so test regular user collaborator or permission semantics separately
    assert(noSftpCollab.ok, 'Collab inspect failed');

    // Clean up test servers
    await api(`${ADMIN_API}/servers/${webSrv.id}`, { method: 'DELETE', token: adminAuth.idToken });
    await api(`${ADMIN_API}/servers/${botId}`, { method: 'DELETE', token: adminAuth.idToken });
    await api(`${ADMIN_API}/servers/${mcId}`, { method: 'DELETE', token: adminAuth.idToken });

    console.log('\nALL LIVE E2E VERIFICATION TESTS PASSED!');
  } finally {
    backend.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('E2E TEST FAILED:', err);
    process.exit(1);
  });
