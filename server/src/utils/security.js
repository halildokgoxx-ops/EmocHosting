import fs from 'fs';
import net from 'net';
import path from 'path';
import crypto from 'crypto';
import AdmZip from 'adm-zip';
import { ENV } from '../config/env.js';

/**
 * Escapes untrusted text for safe HTML interpolation.
 */
export function escapeHtml(val = '') {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validates Firestore document IDs and filesystem IDs against path traversal and slash injection.
 */
export function isValidDocId(id, { allowDots = false, maxLen = 128 } = {}) {
  if (typeof id !== 'string') return false;
  if (!id || id.length > maxLen) return false;
  if (id === '.' || id === '..' || id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    return false;
  }
  const re = allowDots ? /^[a-zA-Z0-9._-]+$/ : /^[a-zA-Z0-9_-]+$/;
  return re.test(id);
}

export function assertSafeDocId(id, label = 'Kimlik', opts = {}) {
  const val = String(id ?? '').trim();
  if (!isValidDocId(val, opts)) {
    throw new Error(`Geçersiz ${label}`);
  }
  return val;
}

/**
 * Validates and parses a finite number within explicit bounds, rejecting NaN, Infinity, booleans, and objects.
 */
export function parseFiniteNumber(val, { min = -Infinity, max = Infinity, integer = false, label = 'Değer' } = {}) {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean' || typeof val === 'object') {
    throw new Error(`${label} geçerli bir sayı olmalıdır`);
  }
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(`${label} geçerli ve sonlu bir sayı olmalıdır`);
  }
  if (integer && !Number.isInteger(num)) {
    throw new Error(`${label} tam sayı olmalıdır`);
  }
  if (num < min || num > max) {
    throw new Error(`${label} ${min} ile ${max} arasında olmalıdır`);
  }
  return num;
}

/**
 * Sanitizes string input, removing null bytes and disallowed control characters.
 */
export function sanitizeString(val, { minLen = 0, maxLen = 500, allowNewlines = false, trim = true } = {}) {
  let s = typeof val === 'string' ? val : String(val ?? '');
  s = s.replace(/\0/g, '');
  if (allowNewlines) {
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  } else {
    s = s.replace(/[\x00-\x1F\x7F]/g, '');
  }
  if (trim) s = s.trim();
  if (s.length > maxLen) s = s.slice(0, maxLen);
  if (s.length < minLen) return null;
  return s;
}

/**
 * Validates HTTP(S) URLs (and optionally relative /assets/... paths) against javascript:/data: XSS.
 */
export function isSafeHttpUrl(url, { allowEmpty = true, allowRelativeAssets = false, maxLen = 500 } = {}) {
  if (url === undefined || url === null || url === '') return allowEmpty;
  if (typeof url !== 'string' || url.length > maxLen) return false;
  const trimmed = url.trim();
  if (!trimmed) return allowEmpty;
  if (allowRelativeAssets && /^\/assets\/[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isSafeDiscordWebhookUrl(url) {
  if (!url) return true;
  if (typeof url !== 'string' || url.length > 500) return false;
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'discord.com' || parsed.hostname === 'discordapp.com') &&
      parsed.pathname.startsWith('/api/webhooks/')
    );
  } catch {
    return false;
  }
}

/**
 * Extracts normalized client IP. Only trusts X-Forwarded-For when TRUST_PROXY is explicitly enabled.
 */
export function getClientIp(req) {
  let raw = '';
  if (ENV.TRUST_PROXY && req.headers?.['x-forwarded-for']) {
    raw = String(req.headers['x-forwarded-for']).split(',')[0].trim();
  } else {
    raw = String(req.socket?.remoteAddress || req.ip || '').trim();
  }
  if (raw.startsWith('::ffff:')) raw = raw.slice(7);
  return raw;
}

/**
 * Constant-time string comparison via SHA-256 digests so timing and length never leak.
 */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Normalizes and validates admin path segment, ensuring it is never /admin.
 */
export function normalizeAdminPath(rawPath, fallback = '/komuta-x9k4') {
  let p = String(rawPath || fallback).trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+$/, '');
  if (!p || p.toLowerCase() === '/admin' || !/^\/[a-z0-9][a-z0-9_-]{2,48}$/i.test(p)) {
    return fallback;
  }
  return p;
}

/**
 * Strict runtime + entryFile validation to prevent CLI flag injection or path traversal in child spawns.
 */
const ALLOWED_RUNTIMES = {
  discord: new Set(['node', 'python']),
  altyapi: new Set(['node', 'python', 'java']),
  web: new Set(['node']),
};

export function validateRuntime(category, runtime) {
  const allowed = ALLOWED_RUNTIMES[category];
  if (!allowed || !allowed.has(String(runtime || '').toLowerCase())) {
    throw new Error('Geçersiz çalışma motoru (runtime)');
  }
  return String(runtime).toLowerCase();
}

export function validateEntryFile(instanceDir, entryFile, resolveSafePathFn) {
  const clean = String(entryFile || '').trim().replace(/\\/g, '/');
  if (
    !clean ||
    clean.length > 120 ||
    clean.startsWith('-') ||
    clean.startsWith('/') ||
    clean.includes('..') ||
    clean.includes('\0') ||
    !/^[a-zA-Z0-9._/-]+$/.test(clean)
  ) {
    throw new Error('Geçersiz giriş dosyası adı');
  }
  resolveSafePathFn(instanceDir, clean);
  return clean;
}

/**
 * Strict allowlist for Minecraft JVM GC flags. Blocks -XX:On*, -javaagent, -agentlib, @file, -cp, etc.
 */
const EXACT_SAFE_JVM_FLAGS = new Set([
  '-XX:+UseG1GC',
  '-XX:+ParallelRefProcEnabled',
  '-XX:+UnlockExperimentalVMOptions',
  '-XX:+DisableExplicitGC',
  '-XX:+AlwaysPreTouch',
  '-XX:+PerfDisableSharedMem',
  '-XX:+UseStringDeduplication',
  '-XX:+OptimizeStringConcat',
  '-Daikars.new.flags=true',
  '-Dusing.aikars.flags=https://mcflags.emc.gs',
  '-Dfile.encoding=UTF-8',
]);

const SAFE_JVM_PATTERNS = [
  /^-XX:MaxGCPauseMillis=\d{1,5}$/,
  /^-XX:G1NewSizePercent=\d{1,2}$/,
  /^-XX:G1MaxNewSizePercent=\d{1,2}$/,
  /^-XX:G1HeapRegionSize=(?:1|2|4|8|16|32)M$/,
  /^-XX:G1ReservePercent=\d{1,2}$/,
  /^-XX:G1HeapWastePercent=\d{1,2}$/,
  /^-XX:G1MixedGCCountTarget=\d{1,2}$/,
  /^-XX:InitiatingHeapOccupancyPercent=\d{1,2}$/,
  /^-XX:G1MixedGCLiveThresholdPercent=\d{1,2}$/,
  /^-XX:G1RSetUpdatingPauseTimePercent=\d{1,2}$/,
  /^-XX:SurvivorRatio=\d{1,2}$/,
  /^-XX:MaxTenuringThreshold=\d{1,2}$/,
  /^-XX:ConcGCThreads=\d{1,2}$/,
  /^-XX:ParallelGCThreads=\d{1,2}$/,
];

export function sanitizeJvmFlags(flags) {
  if (!Array.isArray(flags)) return ['-XX:+UseG1GC'];
  const safe = [];
  for (const raw of flags.slice(0, 30)) {
    if (typeof raw !== 'string') continue;
    const f = raw.trim();
    if (EXACT_SAFE_JVM_FLAGS.has(f) || SAFE_JVM_PATTERNS.some((re) => re.test(f))) {
      if (!safe.includes(f)) safe.push(f);
    }
  }
  return safe.length > 0 ? safe : ['-XX:+UseG1GC'];
}

export function assertValidJvmFlagsInput(flags) {
  if (!Array.isArray(flags) || flags.length > 30) {
    throw new Error('JVM bayrakları en fazla 30 öğeli bir dizi olmalıdır');
  }
  for (const raw of flags) {
    if (typeof raw !== 'string') throw new Error('Geçersiz JVM bayrağı');
    const f = raw.trim();
    if (!EXACT_SAFE_JVM_FLAGS.has(f) && !SAFE_JVM_PATTERNS.some((re) => re.test(f))) {
      throw new Error(`İzin verilmeyen veya güvensiz JVM bayrağı: ${f.slice(0, 40)}`);
    }
  }
  return flags.map((f) => f.trim());
}

/**
 * Validates Forge/NeoForge @argsFile contents before passing to Java spawn.
 */
export function validateMinecraftArgsFile(instanceDir, argsFileRel, resolveSafePathFn) {
  const cleanRel = String(argsFileRel || '').trim().replace(/\\/g, '/');
  if (!cleanRel.startsWith('libraries/') || (!cleanRel.endsWith('/win_args.txt') && !cleanRel.endsWith('/unix_args.txt'))) {
    throw new Error('Geçersiz Forge başlatıcı dosya konumu');
  }
  const fullPath = resolveSafePathFn(instanceDir, cleanRel);
  if (!fs.existsSync(fullPath)) {
    throw new Error('Başlatıcı args dosyası bulunamadı');
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.length > 512 * 1024) {
    throw new Error('Başlatıcı args dosyası çok büyük');
  }
  const forbiddenPatterns = [
    /-XX:On/i,
    /-javaagent/i,
    /-agentlib/i,
    /-agentpath/i,
    /-Xbootclasspath/i,
    /(^|\s)@/,
    /\.\.[/\\]/,
  ];
  for (const pat of forbiddenPatterns) {
    if (pat.test(content)) {
      throw new Error('Başlatıcı args dosyası güvensiz JVM parametreleri içeriyor');
    }
  }
  return cleanRel;
}

/**
 * Blocks dangerous environment variable injection keys in user .env files and prevents leaking host secrets.
 */
const BLOCKED_USER_ENV_KEYS = new Set([
  'NODE_OPTIONS',
  'NODE_EXTRA_CA_CERTS',
  'NODE_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'PATH',
  'PATHEXT',
  'COMSPEC',
  'SHELL',
  'ENV',
  'BASH_ENV',
  'JAVA_TOOL_OPTIONS',
  '_JAVA_OPTIONS',
  'JDK_JAVA_OPTIONS',
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONUSERBASE',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TEMP',
  'TMP',
  'TMPDIR',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PROJECT_ID',
  'OWNER_ADMIN_EMAIL',
]);

export function sanitizeUserEnv(envObj = {}) {
  const clean = {};
  if (!envObj || typeof envObj !== 'object') return clean;
  for (const [rawKey, rawVal] of Object.entries(envObj)) {
    const key = String(rawKey || '').trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) continue;
    if (BLOCKED_USER_ENV_KEYS.has(key.toUpperCase())) continue;
    clean[key] = String(rawVal ?? '').replace(/[\r\n\0]/g, '').slice(0, 4096);
  }
  return clean;
}

export function buildSafeChildEnv(instanceDir, userEnvObj = {}, enforcedOverrides = {}) {
  const baseEnv = {
    PATH: process.env.PATH || process.env.Path || '',
    LANG: process.env.LANG || 'C.UTF-8',
    HOME: instanceDir,
    USERPROFILE: instanceDir,
    TEMP: instanceDir,
    TMP: instanceDir,
  };
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) baseEnv.SystemRoot = process.env.SystemRoot;
    if (process.env.windir) baseEnv.windir = process.env.windir;
    if (process.env.COMSPEC) baseEnv.COMSPEC = process.env.COMSPEC;
    if (process.env.OS) baseEnv.OS = process.env.OS;
  }
  return {
    ...baseEnv,
    ...sanitizeUserEnv(userEnvObj),
    ...enforcedOverrides,
  };
}

/**
 * Safely extracts a ZIP archive (file path or Buffer) into destDir, blocking Zip Slip,
 * symlinks, duplicate entries, and decompression bombs (regardless of spoofed header size).
 */
export function safeExtractZip(
  zipSource,
  destDir,
  {
    resolveSafePathFn,
    maxEntries = 4000,
    maxTotalBytes = 512 * 1024 * 1024,
    maxFileBytes = 150 * 1024 * 1024,
  } = {}
) {
  const zip = new AdmZip(zipSource);
  const entries = zip.getEntries();
  if (entries.length > maxEntries) {
    throw new Error(`Arşivde izin verilenden fazla dosya var (Max ${maxEntries})`);
  }

  let totalWrittenBytes = 0;
  const seenPaths = new Set();

  for (const entry of entries) {
    const rawName = String(entry.entryName || '').replace(/\\/g, '/');
    if (!rawName || rawName.includes('\0') || rawName.startsWith('/') || /^[a-zA-Z]:/.test(rawName)) {
      throw new Error(`Güvensiz arşiv girdisi reddedildi: ${rawName.slice(0, 60)}`);
    }
    const parts = rawName.split('/').filter(Boolean);
    if (parts.some((p) => p === '..' || p === '.')) {
      throw new Error(`Arşivde dizin kaçışı (Zip Slip) tespit edildi: ${rawName.slice(0, 60)}`);
    }
    if (parts.length === 0) continue;

    // Reject symlinks stored in Unix external file attributes (mode & S_IFMT === S_IFLNK)
    const unixMode = (entry.header?.attr >>> 16) & 0o170000;
    if (unixMode === 0o120000) {
      throw new Error(`Arşivde sembolik bağlantı (symlink) yasaktır: ${rawName.slice(0, 60)}`);
    }

    const declaredSize = Number(entry.header?.size || 0);
    if (declaredSize > maxFileBytes) {
      throw new Error(`Arşiv içindeki tekil dosya boyutu sınırı aşıldı (${rawName.slice(0, 40)})`);
    }

    const cleanRel = parts.join('/');
    const targetPath = resolveSafePathFn ? resolveSafePathFn(destDir, cleanRel) : path.resolve(destDir, cleanRel);
    const normKey = targetPath.toLowerCase();

    if (seenPaths.has(normKey)) {
      throw new Error(`Arşivde yinelenen dosya yolu reddedildi: ${cleanRel.slice(0, 60)}`);
    }
    seenPaths.add(normKey);

    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }

    const data = entry.getData();
    if (!Buffer.isBuffer(data)) {
      throw new Error(`Arşiv girdisi okunamadı: ${cleanRel.slice(0, 40)}`);
    }
    if (data.length > maxFileBytes) {
      throw new Error(`Arşiv içindeki dosya açıldığında boyut sınırını aştı (${cleanRel.slice(0, 40)})`);
    }
    totalWrittenBytes += data.length;
    if (totalWrittenBytes > maxTotalBytes) {
      throw new Error(`Arşiv toplam boyutu izin verilen disk sınırını aşıyor (Max ${Math.round(maxTotalBytes / (1024 * 1024))} MB)`);
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    // Re-check targetPath after creating parent dirs in case of symlink race
    if (resolveSafePathFn) resolveSafePathFn(destDir, cleanRel);
    fs.writeFileSync(targetPath, data);
  }

  return { entriesCount: entries.length, totalWrittenBytes };
}

/**
 * Validates that an IP string is a valid IPv4/IPv6 address.
 */
export function isValidIpAddress(ip) {
  return net.isIP(String(ip || '').trim()) !== 0;
}
