import fs from 'fs';
import net from 'net';
import path from 'path';
import os from 'os';
import si from 'systeminformation';
import { db, firebaseStatus } from './firebase.js';
import { ENV, INSTANCES_DIR } from '../config/env.js';

function isEmulatorReachable() {
  if (firebaseStatus.mode !== 'emulator') return Promise.resolve(true);
  const [host, portStr] = String(ENV.FIRESTORE_EMULATOR_HOST || 'localhost:8080').split(':');
  return new Promise((resolve) => {
    const s = net.createConnection({ host: host || '127.0.0.1', port: Number(portStr || 8080), timeout: 400 });
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('error', () => resolve(false));
    s.on('timeout', () => { s.destroy(); resolve(false); });
  });
}

const historySnapshots = [];
const MAX_HISTORY = 30;
const serverHistoryMap = new Map();
const MAX_SERVER_HISTORY = 30;

let lastTelemetry = {
  host: {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpuModel: os.cpus()[0]?.model || 'CPU',
    cpuCores: os.cpus().length,
    cpuLoadPct: 0,
    totalRamMb: Math.round(os.totalmem() / 1024 / 1024),
    usedRamMb: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
    freeRamMb: Math.round(os.freemem() / 1024 / 1024),
    ramUsedPct: 0,
    diskTotalGb: 0,
    diskUsedGb: 0,
    diskUsedPct: 0,
    uptimeSec: Math.round(os.uptime()),
  },
  totals: {
    totalServers: 0,
    runningServers: 0,
    pausedServers: 0,
    stoppedServers: 0,
    dailyServers: 0,
    weeklyServers: 0,
    monthlyServers: 0,
    totalAllocatedRamMb: 0,
    totalUsedRamMb: 0,
    totalCpuPct: 0,
    totalDiskUsedMb: 0,
    totalAllocatedDiskMb: 0,
    byCategory: { minecraft: 0, web: 0, discord: 0, altyapi: 0 },
  },
  perServer: {},
  alerts: [],
  history: [],
  updatedAt: Date.now(),
};

export function getDirSizeMb(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let totalBytes = 0;
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.name === 'node_modules' && stack.length > 4) continue;
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (entry.isFile()) {
          totalBytes += fs.lstatSync(full).size;
        }
      } catch {
        // ignore transient file locks
      }
    }
  }
  return Number((totalBytes / (1024 * 1024)).toFixed(2));
}

export async function collectTelemetrySnapshot(activeProcessesMap, io = null) {
  try {
    const [loadData, memData, fsData, procData] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.processes(),
    ]);

    const mainDisk = fsData.find((d) => d.mount?.toUpperCase().startsWith('C')) || fsData[0] || { size: 0, used: 0, use: 0 };
    const totalRamMb = Math.round(memData.total / 1024 / 1024);
    const usedRamMb = Math.round(memData.active / 1024 / 1024);
    const freeRamMb = Math.max(0, totalRamMb - usedRamMb);

    const host = {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpuModel: os.cpus()[0]?.model || 'CPU',
      cpuCores: os.cpus().length,
      cpuLoadPct: Number((loadData.currentLoad || 0).toFixed(1)),
      totalRamMb,
      usedRamMb,
      freeRamMb,
      ramUsedPct: totalRamMb > 0 ? Number(((usedRamMb / totalRamMb) * 100).toFixed(1)) : 0,
      diskTotalGb: Number(((mainDisk.size || 0) / 1024 / 1024 / 1024).toFixed(1)),
      diskUsedGb: Number(((mainDisk.used || 0) / 1024 / 1024 / 1024).toFixed(1)),
      diskUsedPct: Number((mainDisk.use || 0).toFixed(1)),
      uptimeSec: Math.round(os.uptime()),
    };

    const procByPid = new Map();
    for (const p of procData.list || []) {
      procByPid.set(p.pid, p);
    }

    // Skip Firestore reads if no credentials available
    const emulatorUp = await isEmulatorReachable();
    if (!emulatorUp && !firebaseStatus.hasAdminCredentials) {
      lastTelemetry = {
        ...lastTelemetry,
        host,
        updatedAt: Date.now(),
      };
      return lastTelemetry;
    }

    if (!emulatorUp && firebaseStatus.mode === 'emulator') {
      lastTelemetry = { ...lastTelemetry, host, updatedAt: Date.now() };
      return lastTelemetry;
    }

    const serversSnap = await db.collection('servers').get();
    const configSnap = await db.collection('system_config').doc('global').get();
    const sysCfg = configSnap.exists ? configSnap.data() : {};
    const cpuAlertLimit = Number(sysCfg.cpuAlertThresholdPct || 85);
    const ramAlertLimit = Number(sysCfg.ramAlertThresholdPct || 90);

    const perServer = {};
    const alerts = [];
    const totals = {
      totalServers: 0,
      runningServers: 0,
      pausedServers: 0,
      stoppedServers: 0,
      dailyServers: 0,
      weeklyServers: 0,
      monthlyServers: 0,
      totalAllocatedRamMb: 0,
      totalUsedRamMb: 0,
      totalCpuPct: 0,
      totalDiskUsedMb: 0,
      totalAllocatedDiskMb: 0,
      byCategory: { minecraft: 0, web: 0, discord: 0, altyapi: 0 },
    };

    for (const doc of serversSnap.docs) {
      const srv = { id: doc.id, ...doc.data() };
      totals.totalServers += 1;
      if (srv.billingCycle === 'daily') totals.dailyServers += 1;
      else if (srv.billingCycle === 'weekly') totals.weeklyServers += 1;
      else totals.monthlyServers += 1;

      if (totals.byCategory[srv.category] !== undefined) {
        totals.byCategory[srv.category] += 1;
      }

      const runtime = activeProcessesMap.get(srv.id);
      const isRunning = runtime?.status === 'running' || (srv.status === 'running' && (srv.category === 'web' || runtime));
      const actualStatus = runtime?.status || srv.status || 'stopped';

      if (actualStatus === 'running') totals.runningServers += 1;
      else if (actualStatus === 'paused') totals.pausedServers += 1;
      else totals.stoppedServers += 1;

      const instanceDir = path.join(INSTANCES_DIR, srv.category || 'altyapi', srv.id);
      const diskUsedMb = getDirSizeMb(instanceDir);

      let cpuPct = 0;
      let ramUsedMb = 0;
      let pid = runtime?.pid || null;

      if (pid && procByPid.has(pid)) {
        const pInfo = procByPid.get(pid);
        cpuPct = Number((pInfo.cpu || 0).toFixed(2));
        ramUsedMb = Number(((pInfo.memRss || 0) / 1024).toFixed(2)); // memRss in KB in si -> MB
        if (ramUsedMb > totalRamMb) {
          ramUsedMb = Number(((pInfo.memVsz || 0) / 1024).toFixed(2));
        }
      } else if (srv.category === 'web' && actualStatus === 'running') {
        cpuPct = Number((runtime?.lastCpuPct || 0.2).toFixed(2));
        ramUsedMb = Number((runtime?.webMemMb || 18).toFixed(2));
      }

      const allocatedRamMb = Number(srv.allocatedRamMb || 512);
      const allocatedDiskMb = Number(srv.allocatedDiskMb || 5120);
      const ramPct = allocatedRamMb > 0 ? Number(((ramUsedMb / allocatedRamMb) * 100).toFixed(1)) : 0;

      totals.totalAllocatedRamMb += allocatedRamMb;
      totals.totalAllocatedDiskMb += allocatedDiskMb;
      totals.totalUsedRamMb = Number((totals.totalUsedRamMb + ramUsedMb).toFixed(2));
      totals.totalCpuPct = Number((totals.totalCpuPct + cpuPct).toFixed(2));
      totals.totalDiskUsedMb = Number((totals.totalDiskUsedMb + diskUsedMb).toFixed(2));

      if (isRunning && (cpuPct >= cpuAlertLimit || ramPct >= ramAlertLimit)) {
        alerts.push({
          serverId: srv.id,
          serverName: srv.name,
          ownerEmail: srv.ownerEmail,
          category: srv.category,
          cpuPct,
          ramPct,
          reason: ramPct >= ramAlertLimit ? `Yüksek RAM (%${ramPct})` : `Yüksek CPU (%${cpuPct})`,
        });
      }

      const sampleTime = new Date().toLocaleTimeString('tr-TR', { hour12: false });
      const prevHist = serverHistoryMap.get(srv.id) || [];
      prevHist.push({
        time: sampleTime,
        cpuPct,
        ramUsedMb,
        ramPct,
      });
      if (prevHist.length > MAX_SERVER_HISTORY) prevHist.shift();
      serverHistoryMap.set(srv.id, prevHist);

      perServer[srv.id] = {
        serverId: srv.id,
        name: srv.name,
        ownerUid: srv.ownerUid,
        ownerEmail: srv.ownerEmail,
        category: srv.category,
        billingCycle: srv.billingCycle || 'monthly',
        status: actualStatus,
        pid,
        port: srv.port,
        cpuPct,
        cpuLimitPct: Number(srv.allocatedCpuPct || 100),
        ramUsedMb,
        allocatedRamMb,
        ramPct,
        diskUsedMb,
        allocatedDiskMb,
        uptimeSec: runtime?.startedAt ? Math.floor((Date.now() - runtime.startedAt) / 1000) : 0,
        requestsCount: runtime?.requestsCount || 0,
        bandwidthBytes: runtime?.bandwidthBytes || 0,
        mcInfo: runtime?.mcInfo || null,
        updatedAt: Date.now(),
      };
    }

    // Prune deleted servers from per-server history map
    for (const key of serverHistoryMap.keys()) {
      if (!(key in perServer)) serverHistoryMap.delete(key);
    }

    const point = {
      time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
      hostCpu: host.cpuLoadPct,
      hostRamPct: host.ramUsedPct,
      serversCpu: totals.totalCpuPct,
      serversRamMb: totals.totalUsedRamMb,
      runningServers: totals.runningServers,
    };
    historySnapshots.push(point);
    if (historySnapshots.length > MAX_HISTORY) historySnapshots.shift();

    lastTelemetry = {
      host,
      totals,
      perServer,
      alerts,
      history: [...historySnapshots],
      updatedAt: Date.now(),
    };

    if (io) {
      io.to('admin').emit('telemetry:admin', lastTelemetry);
      for (const [srvId, stat] of Object.entries(perServer)) {
        io.to(`server:${srvId}`).emit('telemetry:server', stat);
      }
    }

    return lastTelemetry;
  } catch (err) {
    console.error('[Telemetry] Snapshot error:', err.message);
    return lastTelemetry;
  }
}

export function getLatestTelemetry() {
  return lastTelemetry;
}

export function getServerTelemetryHistory(serverId) {
  return serverHistoryMap.get(serverId) || [];
}
