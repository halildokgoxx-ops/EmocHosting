import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const SERVER_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env') });
dotenv.config({ path: path.join(SERVER_DIR, '.env') });

export const DATA_DIR = path.join(SERVER_DIR, 'data');
export const INSTANCES_DIR = path.join(SERVER_DIR, 'instances');
export const BACKUPS_DIR = path.join(SERVER_DIR, 'backups');

for (const dir of [DATA_DIR, INSTANCES_DIR, BACKUPS_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

function normalizeAdminPath(rawPath, fallback = '/komuta-x9k4') {
  let p = String(rawPath || fallback).trim();
  if (!p.startsWith('/')) p = '/' + p;
  p = p.replace(/\/+$/, '');
  if (!p || p.toLowerCase() === '/admin' || !/^\/[a-z0-9][a-z0-9_-]{2,48}$/i.test(p)) {
    return fallback;
  }
  return p;
}

const DEFAULT_WINDOWS_JAVA = 'C:\\Program Files\\Android\\Android Studio\\jbr\\bin\\java.exe';
const resolvedDefaultJava = fs.existsSync(DEFAULT_WINDOWS_JAVA) ? DEFAULT_WINDOWS_JAVA : 'java';

const adminRoutePath = normalizeAdminPath(process.env.ADMIN_PATH, '/komuta-x9k4');

export const ENV = {
  ROOT_DIR,
  SERVER_DIR,
  PORT: Number(process.env.PORT || 3001),
  HOST: process.env.HOST || '0.0.0.0',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  PUBLIC_HOST: process.env.PUBLIC_HOST || 'localhost',
  DOMAIN_SUFFIX: (process.env.DOMAIN_SUFFIX || 'emochost.com').toLowerCase().trim(),
  OWNER_ADMIN_EMAIL: (process.env.OWNER_ADMIN_EMAIL || 'halildokgoxx@gmail.com').toLowerCase().trim(),
  TRUST_PROXY: String(process.env.TRUST_PROXY || 'false').toLowerCase() === 'true',
  ADMIN_PATH: adminRoutePath,
  ADMIN_API_PATH: `/api${adminRoutePath}`,

  FIREBASE_MODE: process.env.FIREBASE_MODE || 'emulator',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'demo-emochosting',
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080',
  FIREBASE_SERVICE_ACCOUNT_PATH: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json',
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL || '',
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY || '',

  MC_PROXY_PORT: Number(process.env.MC_PROXY_PORT || 25565),
  ALLOC_PORT_START: Number(process.env.ALLOC_PORT_START || 25566),
  ALLOC_PORT_END: Number(process.env.ALLOC_PORT_END || 26500),
  WEB_PORT_START: Number(process.env.WEB_PORT_START || 8100),
  WEB_PORT_END: Number(process.env.WEB_PORT_END || 8999),
  SFTP_PORT: Number(process.env.SFTP_PORT || 2022),

  JAVA_PATH: process.env.JAVA_PATH || resolvedDefaultJava,
  NODE_PATH: process.env.NODE_PATH || 'node',
  PYTHON_PATH: process.env.PYTHON_PATH || 'python',
};
