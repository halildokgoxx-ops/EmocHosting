import fs from 'fs';
import net from 'net';
import path from 'path';
import crypto from 'crypto';
import { isValidDocId, safeExtractZip } from '../utils/security.js';
import { resolveSafePath } from './processManager.js';

function assertHttpsUrl(rawUrl, label = 'İndirme adresi') {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch {
    throw new Error(`Geçersiz ${label}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Yalnızca HTTPS ${label} kabul edilir`);
  }
  return parsed.toString();
}

function sanitizeArchiveDownloadName(rawName, allowedExts = ['.jar', '.zip']) {
  const base = path.basename(String(rawName || '').trim()).replace(/[\x00-\x1f]/g, '');
  if (!base || base === '.' || base === '..' || base.includes('/') || base.includes('\\')) {
    throw new Error('Geçersiz dosya adı');
  }
  const lower = base.toLowerCase();
  if (!allowedExts.some((ext) => lower.endsWith(ext))) {
    throw new Error('Desteklenmeyen eklenti/mod dosya uzantısı');
  }
  return base;
}

const HEADERS = {
  'User-Agent': 'EmocHosting/3.0 (https://emochosting.com)',
  Accept: 'application/json',
};

const apiCache = new Map();

async function cachedApiFetch(cacheKey, ttlMs, loaderFn) {
  const now = Date.now();
  const hit = apiCache.get(cacheKey);
  if (hit && now < hit.expiresAt) return hit.value;
  const val = await loaderFn();
  if (apiCache.size >= 160) {
    const oldestKey = apiCache.keys().next().value;
    if (oldestKey) apiCache.delete(oldestKey);
  }
  apiCache.set(cacheKey, { value: val, expiresAt: now + ttlMs });
  return val;
}

export const SOFTWARE_CATALOG = [
  {
    id: 'emoccore',
    name: 'EmoçCore',
    badge: 'Önerilen',
    featured: true,
    category: 'plugins',
    tagline: "EmoçHosting'in özel optimize sunucu motoru",
    description: 'Diğer forklara göre daha stabil ve performanslı. Büyük ve orta ölçekli sunucular için AI-tuning JVM & Paper tabanlı optimizasyon.',
    tags: ['AI destekli timings', 'Akıllı chunk motoru', 'Paper & Purpur tabanlı'],
    loaderFacet: 'paper',
  },
  {
    id: 'paper',
    name: 'Paper',
    category: 'plugins',
    description: 'Eklenti kullanmak istiyorsan en iyi ve en hızlı seçim.',
    loaderFacet: 'paper',
  },
  {
    id: 'purpur',
    name: 'Purpur',
    category: 'plugins',
    description: "Paper'ın daha çok ayar sunan hali, eklentilerle çalışır.",
    loaderFacet: 'purpur',
  },
  {
    id: 'fabric',
    name: 'Fabric',
    category: 'mods',
    description: 'Hafif modlar, teknik modlar ve yüksek FPS performans modları için.',
    loaderFacet: 'fabric',
  },
  {
    id: 'forge',
    name: 'Forge',
    category: 'mods',
    description: 'Büyük mod paketleri ve klasik Minecraft modları için.',
    loaderFacet: 'forge',
  },
  {
    id: 'neoforge',
    name: 'NeoForge',
    category: 'mods',
    description: 'Yeni Minecraft sürümlerinde büyük mod paketleri için.',
    loaderFacet: 'neoforge',
  },
  {
    id: 'vanilla',
    name: 'Vanilla',
    category: 'vanilla',
    description: 'Hiç eklenti ya da mod olmadan saf Mojang Minecraft deneyimi.',
    loaderFacet: '',
  },
  {
    id: 'velocity',
    name: 'Velocity',
    category: 'proxy',
    description: 'Birden fazla sunucuyu birbirine bağlayan modern ve yüksek hızlı proxy.',
    loaderFacet: 'velocity',
  },
  {
    id: 'leaf',
    name: 'Leaf',
    category: 'plugins',
    description: 'Paper & Gale tabanlı, çok oyunculu büyük sunucular için ekstra hızlı fork.',
    loaderFacet: 'paper',
  },
  {
    id: 'folia',
    name: 'Folia',
    category: 'plugins',
    description: 'Çok çekirdekli dev sunucular için bölge-bazlı multithreading (eklenti uyumu sınırlı).',
    loaderFacet: 'folia',
  },
  {
    id: 'leaves',
    name: 'Leaves',
    category: 'plugins',
    description: 'Paper tabanlı, teknik redstone ve vanilla düzeltmeleri içeren fork.',
    loaderFacet: 'paper',
  },
  {
    id: 'spigot',
    name: 'Spigot',
    category: 'plugins',
    description: 'Eski usul ve klasik Bukkit/Spigot eklenti sunucusu.',
    loaderFacet: 'spigot',
  },
  {
    id: 'bukkit',
    name: 'Bukkit',
    category: 'plugins',
    description: 'Klasik CraftBukkit eklenti API sunucu çekirdeği.',
    loaderFacet: 'bukkit',
  },
  {
    id: 'quilt',
    name: 'Quilt',
    category: 'mods',
    description: 'Fabric uyumlu, topluluk odaklı modern mod yükleyici.',
    loaderFacet: 'quilt',
  },
  {
    id: 'mohist',
    name: 'Mohist',
    category: 'hybrid',
    description: 'Forge modları ve Bukkit/Spigot eklentileri birlikte (deneysel).',
    loaderFacet: 'forge',
  },
  {
    id: 'arclight',
    name: 'Arclight',
    category: 'hybrid',
    description: 'Mod ve Bukkit eklentileri bir arada (Mixin hibrit).',
    loaderFacet: 'forge',
  },
  {
    id: 'bungeecord',
    name: 'BungeeCord',
    category: 'proxy',
    description: 'Eski usul proxy, lobi ve alt sunucuları birbirine bağlar.',
    loaderFacet: 'bungeecord',
  },
];

function compareMcVersionsDesc(a, b) {
  const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const max = Math.max(pa.length, pb.length);
  for (let i = 0; i < max; i += 1) {
    const diff = (pb[i] || 0) - (pa[i] || 0);
    if (diff !== 0) return diff;
  }
  return String(b).localeCompare(String(a));
}

async function fetchFillV3Versions(project) {
  const res = await fetch(`https://fill.papermc.io/v3/projects/${project}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`${project} API erişilemedi (${res.status})`);
  const data = await res.json();
  const flat = Object.values(data.versions || {}).flat();
  return flat.filter((v) => !v.includes('-rc') && !v.includes('-pre')).slice(0, 28);
}

async function fetchMcJarsVersions(typeUpper) {
  const res = await fetch(`https://mcjars.app/api/v2/builds/${encodeURIComponent(typeUpper)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`McJars ${typeUpper} API erişilemedi (${res.status})`);
  const data = await res.json();
  if (!data.success || !data.builds) throw new Error(`${typeUpper} sürüm listesi boş`);
  return Object.keys(data.builds).sort(compareMcVersionsDesc).slice(0, 28);
}

export async function fetchPaperVersions() {
  return fetchFillV3Versions('paper');
}

export async function fetchFoliaVersions() {
  return fetchFillV3Versions('folia');
}

export async function fetchVelocityVersions() {
  return fetchFillV3Versions('velocity');
}

export async function fetchPurpurVersions() {
  const res = await fetch('https://api.purpurmc.org/v2/purpur', { headers: HEADERS });
  if (!res.ok) throw new Error('Purpur API erişilemedi');
  const data = await res.json();
  return [...(data.versions || [])].reverse().slice(0, 28);
}

export async function fetchFabricVersions() {
  const res = await fetch('https://meta.fabricmc.net/v2/versions/game', { headers: HEADERS });
  if (!res.ok) throw new Error('Fabric API erişilemedi');
  const data = await res.json();
  return (data || []).filter((v) => v.stable).slice(0, 28).map((v) => v.version);
}

export async function fetchVanillaVersions() {
  const res = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', { headers: HEADERS });
  if (!res.ok) throw new Error('Mojang sürüm listesi alınamadı');
  const data = await res.json();
  return (data.versions || []).filter((v) => v.type === 'release').slice(0, 28).map((v) => v.id);
}

export async function fetchLeafVersions() {
  try {
    const res = await fetch('https://api.github.com/repos/Winds-Studio/Leaf/releases?per_page=15', { headers: HEADERS });
    if (res.ok) {
      const releases = await res.json();
      const versions = [];
      for (const rel of releases || []) {
        const m = String(rel.tag_name || rel.name || '').match(/(\d+\.\d+(?:\.\d+)?)/);
        if (m && !versions.includes(m[1])) versions.push(m[1]);
      }
      if (versions.length > 0) return versions.sort(compareMcVersionsDesc);
    }
  } catch {}
  return ['1.21.4', '1.21.1', '1.20.6', '1.20.4'];
}

export async function fetchSoftwareVersions(engine = 'paper') {
  const e = String(engine || 'paper').toLowerCase().trim();
  return cachedApiFetch(`ver:${e}`, 10 * 60 * 1000, async () => {
    if (e === 'emoccore') return fetchPurpurVersions().catch(() => fetchPaperVersions());
    if (e === 'paper' || e === 'folia' || e === 'velocity') return fetchFillV3Versions(e);
    if (e === 'purpur') return fetchPurpurVersions();
    if (e === 'fabric') return fetchFabricVersions();
    if (e === 'vanilla') return fetchVanillaVersions();
    if (e === 'leaf') return fetchLeafVersions();
    if (e === 'bukkit') {
      return ['1.21.4', '1.21.3', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2', '1.8.8'];
    }

    const mcjarsMap = {
      forge: 'FORGE',
      neoforge: 'NEOFORGE',
      spigot: 'SPIGOT',
      quilt: 'QUILT',
      mohist: 'MOHIST',
      arclight: 'ARCLIGHT',
      leaves: 'LEAVES',
      bungeecord: 'BUNGEECORD',
    };
    if (mcjarsMap[e]) {
      return fetchMcJarsVersions(mcjarsMap[e]);
    }
    return fetchPaperVersions();
  });
}

function detectLaunchConfigInDir(targetDir) {
  const launchFile = path.join(targetDir, '.emoc-launch.json');
  try {
    if (fs.existsSync(launchFile)) fs.unlinkSync(launchFile);
  } catch {}

  const checkArgsFiles = [];
  const libsDir = path.join(targetDir, 'libraries');
  if (fs.existsSync(libsDir)) {
    const walk = (dir, depth = 0) => {
      if (depth > 6) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, item.name);
        if (item.isDirectory()) walk(full, depth + 1);
        else if (item.name === 'win_args.txt' || item.name === 'unix_args.txt') {
          checkArgsFiles.push(full);
        }
      }
    };
    walk(libsDir);
  }

  const winArgs = checkArgsFiles.find((p) => p.endsWith('win_args.txt')) || checkArgsFiles[0];
  if (winArgs) {
    const rel = path.relative(targetDir, winArgs).replace(/\\/g, '/');
    fs.writeFileSync(launchFile, JSON.stringify({ mode: 'argsFile', argsFile: rel }, null, 2));
    return { mode: 'argsFile', argsFile: rel };
  }
  return null;
}

export async function downloadMinecraftJar({ engine = 'paper', version = '1.21.4', targetDir, onProgress }) {
  const e = String(engine || 'paper').toLowerCase().trim();
  if (!/^[a-z0-9_-]{2,32}$/.test(e)) {
    throw new Error('Geçersiz Minecraft sunucu motoru');
  }
  const cleanVer = String(version || '').trim();
  if (!/^[a-zA-Z0-9._+-]{1,40}$/.test(cleanVer)) {
    throw new Error('Geçersiz Minecraft sürüm numarası');
  }
  version = cleanVer;
  const destPath = resolveSafePath(targetDir, 'server.jar');
  let downloadUrl = '';
  let zipUrl = '';
  let fileName = 'server.jar';

  const effectiveFill = e === 'paper' || e === 'folia' || e === 'velocity' ? e : null;

  if (effectiveFill) {
    const buildsRes = await fetch(
      `https://fill.papermc.io/v3/projects/${effectiveFill}/versions/${encodeURIComponent(version)}/builds`,
      { headers: HEADERS }
    );
    if (!buildsRes.ok) throw new Error(`${effectiveFill.toUpperCase()} ${version} sürümü bulunamadı`);
    const builds = await buildsRes.json();
    if (!Array.isArray(builds) || builds.length === 0) throw new Error(`${effectiveFill} ${version} için derleme yok`);
    const stable = builds.filter((b) => b.channel === 'STABLE');
    const pool = stable.length > 0 ? stable : builds;
    const latest = [...pool].sort((a, b) => Number(b.id) - Number(a.id))[0];
    const dl = latest.downloads?.['server:default'] || Object.values(latest.downloads || {})[0];
    if (!dl?.url) throw new Error(`${effectiveFill} indirme bağlantısı bulunamadı`);
    fileName = dl.name || `${effectiveFill}-${version}-${latest.id}.jar`;
    downloadUrl = dl.url;
  } else if (e === 'purpur' || e === 'emoccore') {
    const purpurRes = await fetch(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}`, { headers: HEADERS });
    if (purpurRes.ok) {
      downloadUrl = `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/latest/download`;
      fileName = `${e}-${version}-latest.jar`;
    } else {
      // Fallback to Paper if version isn't on Purpur
      return downloadMinecraftJar({ engine: 'paper', version, targetDir, onProgress });
    }
  } else if (e === 'fabric') {
    const [loadersRes, installersRes] = await Promise.all([
      fetch('https://meta.fabricmc.net/v2/versions/loader', { headers: HEADERS }),
      fetch('https://meta.fabricmc.net/v2/versions/installer', { headers: HEADERS }),
    ]);
    const loaders = await loadersRes.json();
    const installers = await installersRes.json();
    const loaderVer = loaders.find((l) => l.stable)?.version || loaders[0]?.version;
    const instVer = installers.find((i) => i.stable)?.version || installers[0]?.version;
    if (!loaderVer || !instVer) throw new Error('Fabric loader/installer sürümü bulunamadı');
    downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loaderVer)}/${encodeURIComponent(instVer)}/server/jar`;
    fileName = `fabric-server-${version}-${loaderVer}.jar`;
  } else if (e === 'vanilla') {
    const manifestRes = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest_v2.json', { headers: HEADERS });
    if (!manifestRes.ok) throw new Error('Mojang manifest alınamadı');
    const manifest = await manifestRes.json();
    const entry = (manifest.versions || []).find((v) => v.id === version);
    if (!entry) throw new Error(`Vanilla ${version} sürümü bulunamadı`);
    const metaRes = await fetch(entry.url, { headers: HEADERS });
    const meta = await metaRes.json();
    downloadUrl = meta.downloads?.server?.url;
    if (!downloadUrl) throw new Error('Bu sürüm için sunucu JAR dosyası yok');
  } else if (e === 'leaf') {
    const relRes = await fetch('https://api.github.com/repos/Winds-Studio/Leaf/releases?per_page=20', { headers: HEADERS });
    if (!relRes.ok) throw new Error('Leaf GitHub API erişilemedi');
    const releases = await relRes.json();
    let asset = null;
    for (const rel of releases || []) {
      const a = (rel.assets || []).find((f) => f.name.endsWith('.jar') && f.name.includes(version));
      if (a) {
        asset = a;
        break;
      }
    }
    if (!asset) throw new Error(`Leaf ${version} derlemesi bulunamadı`);
    downloadUrl = asset.browser_download_url;
    fileName = asset.name;
  } else if (e === 'bukkit') {
    downloadUrl = `https://cdn.getbukkit.org/craftbukkit/craftbukkit-${encodeURIComponent(version)}.jar`;
    fileName = `craftbukkit-${version}.jar`;
  } else {
    // Forge, NeoForge, Spigot, Quilt, Mohist, Arclight, Leaves, BungeeCord via McJars v2
    const typeUpper = e.toUpperCase();
    const buildsRes = await fetch(
      `https://mcjars.app/api/v2/builds/${encodeURIComponent(typeUpper)}/${encodeURIComponent(version)}`,
      { headers: HEADERS }
    );
    if (!buildsRes.ok) throw new Error(`${e} ${version} sürümü McJars API'de bulunamadı`);
    const data = await buildsRes.json();
    const first = Array.isArray(data.builds) ? data.builds[0] : null;
    if (!first) throw new Error(`${e} ${version} için indirme paketi bulunamadı`);
    if (first.jarUrl) {
      downloadUrl = first.jarUrl;
      fileName = `${e}-${version}-${first.name || first.id}.jar`;
    } else if (first.zipUrl) {
      zipUrl = first.zipUrl;
      fileName = `${e}-${version}-${first.name || first.id}.zip`;
    } else {
      throw new Error(`${e} ${version} için geçerli JAR/ZIP adresi bulunamadı`);
    }
  }

  let sizeMb = 0;
  let launchMeta = null;

  if (zipUrl) {
    const safeZipUrl = assertHttpsUrl(zipUrl, 'arşiv adresi');
    onProgress?.(`Paket ZIP indiriliyor: ${safeZipUrl}`);
    const zRes = await fetch(safeZipUrl, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
    if (!zRes.ok) throw new Error(`Sunucu arşivi indirilemedi (HTTP ${zRes.status})`);
    const arrayBuffer = await zRes.arrayBuffer();
    if (arrayBuffer.byteLength > 512 * 1024 * 1024) {
      throw new Error('Sunucu arşivi maksimum boyut sınırını (512 MB) aşıyor');
    }
    const buf = Buffer.from(arrayBuffer);
    sizeMb = Number((buf.length / (1024 * 1024)).toFixed(2));
    safeExtractZip(buf, targetDir, {
      resolveSafePathFn: resolveSafePath,
      maxEntries: 5000,
      maxTotalBytes: 512 * 1024 * 1024,
      maxFileBytes: 150 * 1024 * 1024,
    });
    launchMeta = detectLaunchConfigInDir(targetDir);
    onProgress?.(`Arşiv çıkarıldı (${sizeMb} MB) — Başlatıcı hazır.`);
  } else {
    try {
      const lf = path.join(targetDir, '.emoc-launch.json');
      if (fs.existsSync(lf)) fs.unlinkSync(lf);
    } catch {}
    const safeDlUrl = assertHttpsUrl(downloadUrl, 'JAR indirme adresi');
    onProgress?.(`İndiriliyor: ${safeDlUrl}`);
    const jarRes = await fetch(safeDlUrl, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
    if (!jarRes.ok) throw new Error(`JAR indirilemedi (HTTP ${jarRes.status})`);
    const arrayBuffer = await jarRes.arrayBuffer();
    if (arrayBuffer.byteLength > 250 * 1024 * 1024) {
      throw new Error('Sunucu JAR dosyası maksimum boyut sınırını (250 MB) aşıyor');
    }
    fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
    sizeMb = Number((arrayBuffer.byteLength / (1024 * 1024)).toFixed(2));
    onProgress?.(`Kurulum tamamlandı: server.jar (${sizeMb} MB)`);
  }

  if (e === 'emoccore') {
    const flagNote = '# EmoçCore AI Performance Preset Active\n';
    const notePath = path.join(targetDir, 'emoccore.info');
    fs.writeFileSync(notePath, `${flagNote}version=${version}\ntunedAt=${new Date().toISOString()}\n`);
  }

  return { sizeMb, engine: e, version, sourceName: fileName, launchMeta };
}

const MODRINTH_CAT_MAP = {
  popular: '',
  performance: 'optimization',
  technology: 'technology',
  adventure: 'adventure',
  magic: 'magic',
  worldgen: 'worldgen',
  decoration: 'decoration',
  utility: 'utility',
  storage: 'storage',
  mobs: 'mobs',
  food: 'food',
};

const CURSEFORGE_CAT_MAP = {
  popular: null,
  performance: 423,
  technology: 412,
  adventure: 422,
  magic: 419,
  worldgen: 406,
  decoration: 424,
  utility: 5191,
  storage: 420,
  mobs: 411,
  food: 436,
};

export async function searchModrinthContent(
  query = '',
  { type = 'plugin', loader = '', version = '', category = 'popular', limit = 16 } = {}
) {
  const facets = [[`project_type:${type}`]];
  if (version) facets.push([`versions:${version}`]);
  if (loader) {
    const l = loader === 'emoccore' || loader === 'leaf' || loader === 'leaves' ? 'paper' : loader;
    facets.push([`categories:${l}`]);
  }
  const catSlug = MODRINTH_CAT_MAP[category];
  if (catSlug) facets.push([`categories:${catSlug}`]);

  const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query || '')}&limit=${limit}&index=downloads&facets=${encodeURIComponent(
    JSON.stringify(facets)
  )}`;
  return cachedApiFetch(`mr:${url}`, 60 * 1000, async () => {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Modrinth API hatası (${res.status})`);
    const data = await res.json();
    return (data.hits || []).map((h) => ({
      id: h.project_id,
      source: 'modrinth',
      slug: h.slug,
      title: h.title,
      description: h.description,
      downloads: h.downloads || 0,
      iconUrl: h.icon_url || '',
      author: h.author || 'Modrinth',
      projectType: h.project_type || type,
      categories: h.categories || [],
      websiteUrl: `https://modrinth.com/${h.project_type || type}/${h.slug}`,
    }));
  });
}

export async function searchCurseForgeContent(
  query = '',
  { type = 'mod', loader = '', version = '', category = 'popular', limit = 16, apiKey = '' } = {}
) {
  const classId = type === 'modpack' ? 4471 : type === 'plugin' ? 5 : 6;
  const loaderMap = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
  const params = new URLSearchParams({
    gameId: '432',
    classId: String(classId),
    pageSize: String(limit),
    sortField: '2', // Popularity
    sortOrder: 'desc',
  });
  if (query) params.set('searchFilter', query);
  if (version) params.set('gameVersion', version);
  if (loader && loaderMap[loader.toLowerCase()]) {
    params.set('modLoaderType', String(loaderMap[loader.toLowerCase()]));
  }
  const cfCat = CURSEFORGE_CAT_MAP[category];
  if (cfCat) params.set('categoryId', String(cfCat));

  const base = apiKey ? 'https://api.curseforge.com/v1/mods/search' : 'https://api.curse.tools/v1/cf/mods/search';
  const headers = { ...HEADERS };
  if (apiKey) headers['x-api-key'] = apiKey;

  const fullUrl = `${base}?${params.toString()}`;
  return cachedApiFetch(`cf:${apiKey ? 'auth' : 'pub'}:${fullUrl}`, 60 * 1000, async () => {
    const res = await fetch(fullUrl, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`CurseForge API hatası (${res.status})`);
    const data = await res.json();
    return (data.data || []).map((m) => ({
      id: String(m.id),
      source: 'curseforge',
      slug: m.slug,
      title: m.name,
      description: m.summary || '',
      downloads: m.downloadCount || 0,
      iconUrl: m.logo?.thumbnailUrl || m.logo?.url || '',
      author: m.authors?.[0]?.name || 'CurseForge',
      projectType: type,
      categories: (m.categories || []).map((c) => c.name),
      websiteUrl: m.links?.websiteUrl || `https://www.curseforge.com/minecraft/${type === 'plugin' ? 'bukkit-plugins' : 'mc-mods'}/${m.slug}`,
    }));
  });
}

export async function installModrinthContent({ projectId, targetDir, type = 'plugin', version = '', loader = '' }) {
  const safeProjectId = String(projectId || '').trim();
  if (!isValidDocId(safeProjectId, { maxLen: 64 })) {
    throw new Error('Geçersiz Modrinth proje kimliği');
  }
  const params = new URLSearchParams();
  if (version) params.set('game_versions', JSON.stringify([version]));
  if (loader) {
    const l = loader === 'emoccore' || loader === 'leaf' || loader === 'leaves' ? 'paper' : loader;
    params.set('loaders', JSON.stringify([l]));
  }
  const url = `https://api.modrinth.com/v2/project/${encodeURIComponent(safeProjectId)}/version${
    params.toString() ? '?' + params.toString() : ''
  }`;
  let verRes = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  let versions = verRes.ok ? await verRes.json() : [];

  if (!Array.isArray(versions) || versions.length === 0) {
    verRes = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(safeProjectId)}/version`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(30_000),
    });
    if (!verRes.ok) throw new Error('Eklenti/Mod sürümü bulunamadı');
    versions = await verRes.json();
  }
  if (!Array.isArray(versions) || versions.length === 0) throw new Error('İndirilebilir dosya yok');

  const latest = versions[0];
  const file =
    latest.files?.find((f) => f.filename.endsWith(type === 'datapack' || type === 'modpack' ? '.zip' : '.jar')) ||
    latest.files?.[0];
  if (!file) throw new Error('Uygun dosya bulunamadı');

  const safeFilename = sanitizeArchiveDownloadName(file.filename);
  const safeFileUrl = assertHttpsUrl(file.url, 'dosya adresi');

  const subFolder =
    type === 'mod'
      ? 'mods'
      : type === 'datapack'
      ? path.join('world', 'datapacks')
      : type === 'modpack'
      ? 'modpacks'
      : 'plugins';
  const destDir = resolveSafePath(targetDir, subFolder);
  fs.mkdirSync(destDir, { recursive: true });

  const jarRes = await fetch(safeFileUrl, { headers: HEADERS, signal: AbortSignal.timeout(90_000) });
  if (!jarRes.ok) throw new Error('Dosya indirilemedi');
  const buf = Buffer.from(await jarRes.arrayBuffer());
  if (buf.length > 150 * 1024 * 1024) {
    throw new Error('İndirilen eklenti/mod dosyası boyut sınırını (150 MB) aşıyor');
  }
  const outPath = resolveSafePath(destDir, safeFilename);
  fs.writeFileSync(outPath, buf);
  return { filename: safeFilename, folder: subFolder, source: 'modrinth', versionNumber: latest.version_number, sizeKb: Math.round(buf.length / 1024) };
}

export async function installCurseForgeContent({ modId, targetDir, type = 'mod', version = '', apiKey = '' }) {
  const safeModId = String(modId || '').trim();
  if (!/^\d{1,16}$/.test(safeModId)) {
    throw new Error('Geçersiz CurseForge mod kimliği');
  }
  const base = apiKey
    ? `https://api.curseforge.com/v1/mods/${encodeURIComponent(safeModId)}/files`
    : `https://api.curse.tools/v1/cf/mods/${encodeURIComponent(safeModId)}/files`;
  const headers = { ...HEADERS };
  if (apiKey) headers['x-api-key'] = apiKey;

  const params = new URLSearchParams({ pageSize: '15' });
  if (version) params.set('gameVersion', version);

  let res = await fetch(`${base}?${params.toString()}`, { headers, signal: AbortSignal.timeout(30_000) });
  let json = res.ok ? await res.json() : { data: [] };
  if (!json.data || json.data.length === 0) {
    res = await fetch(`${base}?pageSize=10`, { headers, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error('CurseForge dosya listesi alınamadı');
    json = await res.json();
  }

  const file = (json.data || []).find((f) => f.downloadUrl) || json.data?.[0];
  if (!file) throw new Error('CurseForge üzerinde indirilebilir dosya bulunamadı');

  const safeFilename = sanitizeArchiveDownloadName(file.fileName);
  let dlUrl = file.downloadUrl;
  if (!dlUrl && file.id) {
    const idStr = String(file.id);
    dlUrl = `https://edge.forgecdn.net/files/${idStr.slice(0, 4)}/${idStr.slice(4)}/${encodeURIComponent(safeFilename)}`;
  }
  if (!dlUrl) throw new Error('Bu mod için doğrudan indirme bağlantısı paylaşılmamış');
  const safeDlUrl = assertHttpsUrl(dlUrl, 'CurseForge indirme adresi');

  const subFolder =
    type === 'plugin' ? 'plugins' : type === 'modpack' ? 'modpacks' : 'mods';
  const destDir = resolveSafePath(targetDir, subFolder);
  fs.mkdirSync(destDir, { recursive: true });

  const jarRes = await fetch(safeDlUrl, { headers: HEADERS, signal: AbortSignal.timeout(90_000) });
  if (!jarRes.ok) throw new Error(`CurseForge indirme hatası (HTTP ${jarRes.status})`);
  const buf = Buffer.from(await jarRes.arrayBuffer());
  if (buf.length > 150 * 1024 * 1024) {
    throw new Error('İndirilen mod dosyası boyut sınırını (150 MB) aşıyor');
  }
  const outPath = resolveSafePath(destDir, safeFilename);
  fs.writeFileSync(outPath, buf);

  return {
    filename: safeFilename,
    folder: subFolder,
    source: 'curseforge',
    versionNumber: file.displayName || safeFilename,
    sizeKb: Math.round(buf.length / 1024),
  };
}

export async function lookupMinecraftUuid(username) {
  const clean = String(username || '').trim();
  try {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(clean)}`, {
      headers: HEADERS,
    });
    if (res.ok) {
      const data = await res.json();
      const raw = data.id;
      const formatted = `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
      return { uuid: formatted, name: data.name || clean, official: true };
    }
  } catch {}

  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${clean}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  const offlineUuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return { uuid: offlineUuid, name: clean, official: false };
}

function writeVarInt(value) {
  const bytes = [];
  let val = value;
  while (true) {
    if ((val & ~0x7f) === 0) {
      bytes.push(val);
      break;
    }
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let numRead = 0;
  let result = 0;
  let byte;
  do {
    if (offset + numRead >= buffer.length) return null;
    byte = buffer[offset + numRead];
    result |= (byte & 0x7f) << (7 * numRead);
    numRead += 1;
    if (numRead > 5) throw new Error('VarInt too big');
  } while ((byte & 0x80) !== 0);
  return { value: result, size: numRead };
}

export function pingMinecraftServer(host = '127.0.0.1', port = 25565, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let chunks = [];
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => finish({ online: false }));
    socket.on('error', () => finish({ online: false }));

    socket.connect(port, host, () => {
      const hostBuf = Buffer.from(host, 'utf8');
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port, 0);
      const payload = Buffer.concat([
        writeVarInt(0x00),
        writeVarInt(767),
        writeVarInt(hostBuf.length),
        hostBuf,
        portBuf,
        writeVarInt(1),
      ]);
      const handshakePacket = Buffer.concat([writeVarInt(payload.length), payload]);
      const statusReq = Buffer.from([0x01, 0x00]);
      socket.write(Buffer.concat([handshakePacket, statusReq]));
    });

    socket.on('data', (data) => {
      chunks.push(data);
      const buf = Buffer.concat(chunks);
      try {
        const packetLen = readVarInt(buf, 0);
        if (!packetLen || buf.length < packetLen.size + packetLen.value) return;
        let offset = packetLen.size;
        const packetId = readVarInt(buf, offset);
        if (!packetId) return;
        offset += packetId.size;
        const strLen = readVarInt(buf, offset);
        if (!strLen) return;
        offset += strLen.size;
        if (buf.length < offset + strLen.value) return;
        const jsonStr = buf.subarray(offset, offset + strLen.value).toString('utf8');
        const parsed = JSON.parse(jsonStr);
        finish({
          online: true,
          latencyMs: Date.now() - start,
          playersOnline: parsed.players?.online ?? 0,
          playersMax: parsed.players?.max ?? 0,
          playerSample: parsed.players?.sample || [],
          version: parsed.version?.name || '',
          motd: typeof parsed.description === 'string' ? parsed.description : parsed.description?.text || '',
        });
      } catch {}
    });
  });
}
