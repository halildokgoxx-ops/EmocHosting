import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ssh2Pkg from 'ssh2';
import { DATA_DIR, ENV } from '../config/env.js';
import { db } from './firebase.js';
import { getInstanceDir, resolveSafePath } from './processManager.js';
import { getDirSizeMb } from './telemetry.js';
import { isValidDocId, timingSafeEqualStr } from '../utils/security.js';

const { Server: SSH2Server, utils: ssh2Utils } = ssh2Pkg;
const OPEN_MODE = ssh2Utils.sftp.OPEN_MODE;
const STATUS_CODE = ssh2Utils.sftp.STATUS_CODE;

const sftpLogsByServer = new Map();
const sftpFailedAttempts = new Map();
const MAX_OPEN_HANDLES = 64;
const SFTP_AUTH_WINDOW_MS = 5 * 60_000;
const SFTP_MAX_FAILS = 10;
let sftpServerInstance = null;

function isSftpIpRateLimited(ip) {
  const cutoff = Date.now() - SFTP_AUTH_WINDOW_MS;
  const list = (sftpFailedAttempts.get(ip) || []).filter((ts) => ts > cutoff);
  if (list.length === 0) sftpFailedAttempts.delete(ip);
  else sftpFailedAttempts.set(ip, list);
  return list.length >= SFTP_MAX_FAILS;
}

function recordSftpFailure(ip) {
  const cutoff = Date.now() - SFTP_AUTH_WINDOW_MS;
  const list = (sftpFailedAttempts.get(ip) || []).filter((ts) => ts > cutoff);
  list.push(Date.now());
  sftpFailedAttempts.set(ip, list);
}

export function pushSftpLog(serverId, message) {
  if (!sftpLogsByServer.has(serverId)) sftpLogsByServer.set(serverId, []);
  const list = sftpLogsByServer.get(serverId);
  list.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
    message,
  });
  if (list.length > 50) list.pop();
}

export function getSftpLogs(serverId) {
  return sftpLogsByServer.get(serverId) || [];
}

function getOrCreateHostKey() {
  const keyPath = path.join(DATA_DIR, 'sftp_host_key.pem');
  if (!fs.existsSync(keyPath)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    });
    fs.writeFileSync(keyPath, privateKey, { mode: 0o600 });
  }
  return fs.readFileSync(keyPath);
}

export function generateSftpPassword() {
  return 'emoc_' + crypto.randomBytes(10).toString('base64url');
}

function toPosix(p) {
  return String(p || '/').replace(/\\/g, '/');
}

function resolveVirtualPath(instanceDir, virtualPath) {
  const clean = toPosix(virtualPath).replace(/^\/+/, '');
  return resolveSafePath(instanceDir, clean);
}

function formatLongname(name, stat) {
  const isDir = stat.isDirectory();
  const perms = isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const size = String(stat.size || 0).padStart(10, ' ');
  const d = new Date(stat.mtimeMs || Date.now());
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateStr = `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${perms} 1 emoc emoc ${size} ${dateStr} ${name}`;
}

export function startSftpServer() {
  if (sftpServerInstance) return sftpServerInstance;

  const hostKey = getOrCreateHostKey();
  const srv = new SSH2Server({ hostKeys: [hostKey] }, (client) => {
    let authedServer = null;
    let instanceDir = '';
    let clientIp = String(client._sock?.remoteAddress || 'unknown').trim();
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.slice(7);

    client.on('authentication', async (ctx) => {
      try {
        if (ctx.method !== 'password') {
          return ctx.reject(['password']);
        }
        if (isSftpIpRateLimited(clientIp)) {
          return ctx.reject();
        }
        const banSnap = await db.collection('ip_bans').where('ip', '==', clientIp).limit(1).get();
        if (!banSnap.empty) {
          return ctx.reject();
        }

        const rawUser = String(ctx.username || '').trim();
        const serverId = rawUser.includes('.') ? rawUser.split('.').pop() : rawUser.replace(/^srv_/, '');
        if (!isValidDocId(serverId)) {
          recordSftpFailure(clientIp);
          return ctx.reject();
        }

        const srvSnap = await db.collection('servers').doc(serverId).get();
        if (!srvSnap.exists) {
          recordSftpFailure(clientIp);
          return ctx.reject();
        }

        const serverData = { id: srvSnap.id, ...srvSnap.data() };
        if (serverData.status === 'suspended') return ctx.reject();
        if (serverData.expiresAt && Number(serverData.expiresAt) < Date.now()) return ctx.reject();
        if (serverData.sftp?.enabled === false) return ctx.reject();

        const expectedPass = serverData.sftp?.password;
        if (!expectedPass || !timingSafeEqualStr(String(ctx.password || ''), String(expectedPass))) {
          recordSftpFailure(clientIp);
          pushSftpLog(serverId, `Başarısız SFTP giriş denemesi (${clientIp})`);
          return ctx.reject();
        }

        sftpFailedAttempts.delete(clientIp);
        authedServer = serverData;
        instanceDir = getInstanceDir(serverData.category, serverData.id);
        fs.mkdirSync(instanceDir, { recursive: true });
        pushSftpLog(serverId, `SFTP bağlantısı kuruldu (${clientIp})`);
        return ctx.accept();
      } catch {
        return ctx.reject();
      }
    });

    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept();
        session.on('sftp', (acceptSftp) => {
          const sftp = acceptSftp();
          const handles = new Map();
          let handleSeq = 1;
          let bytesSinceQuotaCheck = 0;

          const closeAllHandles = () => {
            for (const h of handles.values()) {
              if (h?.type === 'file' && h.fd !== undefined) {
                try { fs.closeSync(h.fd); } catch {}
              }
            }
            handles.clear();
          };
          session.on('close', closeAllHandles);
          sftp.on('end', closeAllHandles);
          client.on('close', closeAllHandles);

          const makeHandle = (val) => {
            if (handles.size >= MAX_OPEN_HANDLES) {
              throw new Error('Maksimum açık dosya tanıtıcısı sınırına ulaşıldı');
            }
            const id = handleSeq++;
            handles.set(id, val);
            const buf = Buffer.alloc(4);
            buf.writeUInt32BE(id, 0);
            return buf;
          };

          const getHandle = (buf) => {
            if (!buf || buf.length < 4) return null;
            return handles.get(buf.readUInt32BE(0));
          };

          sftp.on('REALPATH', (reqid, reqPath) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath === '.' ? '/' : reqPath);
              const rel = '/' + toPosix(path.relative(instanceDir, target));
              sftp.name(reqid, [{ filename: rel === '/.' ? '/' : rel, longname: rel }]);
            } catch {
              sftp.name(reqid, [{ filename: '/', longname: '/' }]);
            }
          });

          const statHandler = (reqid, reqPath, follow) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              const st = follow ? fs.statSync(target) : fs.lstatSync(target);
              sftp.attrs(reqid, {
                mode: st.mode,
                uid: 1000,
                gid: 1000,
                size: st.size,
                atime: Math.floor(st.atimeMs / 1000),
                mtime: Math.floor(st.mtimeMs / 1000),
              });
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          };

          sftp.on('STAT', (reqid, p) => statHandler(reqid, p, true));
          sftp.on('LSTAT', (reqid, p) => statHandler(reqid, p, false));

          sftp.on('FSTAT', (reqid, handle) => {
            const h = getHandle(handle);
            if (!h || h.fd === undefined) return sftp.status(reqid, STATUS_CODE.FAILURE);
            try {
              const st = fs.fstatSync(h.fd);
              sftp.attrs(reqid, {
                mode: st.mode,
                uid: 1000,
                gid: 1000,
                size: st.size,
                atime: Math.floor(st.atimeMs / 1000),
                mtime: Math.floor(st.mtimeMs / 1000),
              });
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('OPENDIR', (reqid, reqPath) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              const entries = fs.readdirSync(target);
              sftp.handle(reqid, makeHandle({ type: 'dir', dirPath: target, entries, readDone: false }));
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          sftp.on('READDIR', (reqid, handle) => {
            const h = getHandle(handle);
            if (!h || h.type !== 'dir') return sftp.status(reqid, STATUS_CODE.FAILURE);
            if (h.readDone) return sftp.status(reqid, STATUS_CODE.EOF);
            h.readDone = true;

            const list = [];
            for (const name of h.entries) {
              try {
                const st = fs.lstatSync(path.join(h.dirPath, name));
                if (st.isSymbolicLink()) continue;
                list.push({
                  filename: name,
                  longname: formatLongname(name, st),
                  attrs: {
                    mode: st.mode,
                    uid: 1000,
                    gid: 1000,
                    size: st.size,
                    atime: Math.floor(st.atimeMs / 1000),
                    mtime: Math.floor(st.mtimeMs / 1000),
                  },
                });
              } catch {}
            }
            sftp.name(reqid, list);
          });

          sftp.on('OPEN', (reqid, reqPath, flags) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              let fsFlags = 'r';
              const writeRequested = (flags & OPEN_MODE.WRITE) !== 0 || (flags & OPEN_MODE.CREAT) !== 0;
              if (writeRequested) {
                const diskMb = getDirSizeMb(instanceDir);
                if (diskMb > Number(authedServer.allocatedDiskMb || 5120)) {
                  return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
                }
                fs.mkdirSync(path.dirname(target), { recursive: true });
                if ((flags & OPEN_MODE.TRUNC) !== 0 || !fs.existsSync(target)) {
                  fsFlags = (flags & OPEN_MODE.READ) !== 0 ? 'w+' : 'w';
                } else {
                  fsFlags = 'r+';
                }
              }
              if (handles.size >= MAX_OPEN_HANDLES) {
                return sftp.status(reqid, STATUS_CODE.FAILURE);
              }
              const fd = fs.openSync(target, fsFlags);
              if (writeRequested) pushSftpLog(authedServer.id, `Dosya yükleniyor/yazılıyor: ${toPosix(reqPath)}`);
              try {
                sftp.handle(reqid, makeHandle({ type: 'file', fd, filePath: target }));
              } catch (handleErr) {
                try { fs.closeSync(fd); } catch {}
                throw handleErr;
              }
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('READ', (reqid, handle, offset, length) => {
            const h = getHandle(handle);
            if (!h || h.type !== 'file') return sftp.status(reqid, STATUS_CODE.FAILURE);
            try {
              const buf = Buffer.alloc(Math.min(length, 65536));
              const bytesRead = fs.readSync(h.fd, buf, 0, buf.length, offset);
              if (bytesRead === 0) return sftp.status(reqid, STATUS_CODE.EOF);
              sftp.data(reqid, buf.subarray(0, bytesRead));
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('WRITE', (reqid, handle, offset, data) => {
            const h = getHandle(handle);
            if (!h || h.type !== 'file') return sftp.status(reqid, STATUS_CODE.FAILURE);
            try {
              const quotaMb = Number(authedServer.allocatedDiskMb || 5120);
              bytesSinceQuotaCheck += data.length;
              if (bytesSinceQuotaCheck >= 1024 * 1024 || data.length > 512 * 1024) {
                bytesSinceQuotaCheck = 0;
                const diskMb = getDirSizeMb(instanceDir);
                if (diskMb + data.length / (1024 * 1024) > quotaMb) {
                  return sftp.status(reqid, STATUS_CODE.PERMISSION_DENIED);
                }
              }
              fs.writeSync(h.fd, data, 0, data.length, offset);
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('CLOSE', (reqid, handle) => {
            if (!handle || handle.length < 4) return sftp.status(reqid, STATUS_CODE.OK);
            const id = handle.readUInt32BE(0);
            const h = handles.get(id);
            if (h?.type === 'file' && h.fd !== undefined) {
              try { fs.closeSync(h.fd); } catch {}
            }
            handles.delete(id);
            sftp.status(reqid, STATUS_CODE.OK);
          });

          sftp.on('MKDIR', (reqid, reqPath) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              fs.mkdirSync(target, { recursive: true });
              pushSftpLog(authedServer.id, `Klasör oluşturuldu: ${toPosix(reqPath)}`);
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('REMOVE', (reqid, reqPath) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              fs.unlinkSync(target);
              pushSftpLog(authedServer.id, `Dosya silindi: ${toPosix(reqPath)}`);
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          sftp.on('RMDIR', (reqid, reqPath) => {
            try {
              const target = resolveVirtualPath(instanceDir, reqPath);
              fs.rmSync(target, { recursive: true, force: true });
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE);
            }
          });

          sftp.on('RENAME', (reqid, oldPath, newPath) => {
            try {
              const from = resolveVirtualPath(instanceDir, oldPath);
              const to = resolveVirtualPath(instanceDir, newPath);
              fs.renameSync(from, to);
              pushSftpLog(authedServer.id, `Yeniden adlandırıldı: ${toPosix(oldPath)} -> ${toPosix(newPath)}`);
              sftp.status(reqid, STATUS_CODE.OK);
            } catch {
              sftp.status(reqid, STATUS_CODE.FAILURE);
            }
          });

          sftp.on('SETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));
          sftp.on('FSETSTAT', (reqid) => sftp.status(reqid, STATUS_CODE.OK));
        });
      });
    });

    client.on('error', () => {});
  });

  srv.on('error', (err) => {
    console.warn(`[SFTP] Port ${ENV.SFTP_PORT} dinlenemedi:`, err.message);
  });

  srv.listen(ENV.SFTP_PORT, '0.0.0.0', () => {
    console.log(`🔐 Gerçek SFTP Sunucusu aktif -> sftp://${ENV.PUBLIC_HOST}:${ENV.SFTP_PORT}`);
  });

  sftpServerInstance = srv;
  return srv;
}
