import cron from 'node-cron';
import { db } from './firebase.js';
import { collectTelemetrySnapshot } from './telemetry.js';
import {
  activeProcesses,
  stopServer,
  restartServer,
  createServerBackupZip,
  sendConsoleCommand,
} from './processManager.js';
import { sendDiscordWebhook } from './webhook.js';
import { drawGiveawayWinners } from './giveawayService.js';

let telemetryTimer = null;
let cronJob = null;

export function startSchedulers(io) {
  if (telemetryTimer) clearInterval(telemetryTimer);

  // Collect real OS & per-process telemetry every 3 seconds
  collectTelemetrySnapshot(activeProcesses, io);
  telemetryTimer = setInterval(() => {
    collectTelemetrySnapshot(activeProcesses, io);
  }, 3000);

  if (cronJob) cronJob.stop();

  // Run every minute for real expirations & scheduled server tasks
  cronJob = cron.schedule('* * * * *', async () => {
    const now = Date.now();
    try {
      const cfgSnap = await db.collection('system_config').doc('global').get();
      const sysCfg = cfgSnap.exists ? cfgSnap.data() : {};

      if (sysCfg.autoSuspendExpired !== false) {
        const serversSnap = await db.collection('servers').get();
        for (const doc of serversSnap.docs) {
          const srv = { id: doc.id, ...doc.data() };
          if (srv.expiresAt && now > srv.expiresAt && srv.status !== 'suspended') {
            await stopServer(srv.id, { pause: false, forceKill: true }).catch(() => {});
            await db.collection('servers').doc(srv.id).update({
              status: 'suspended',
              suspendedReason: 'Paket süresi doldu',
              updatedAt: now,
            });
            await sendDiscordWebhook({
              title: 'Sunucu Süresi Doldu',
              description: `**${srv.name}** (${srv.ownerEmail}) paket süresi dolduğu için askıya alındı.`,
              color: 0xef4444,
            });
          }

          // Execute per-server scheduled tasks if due
          if (Array.isArray(srv.scheduledTasks) && srv.scheduledTasks.length > 0 && srv.status === 'running') {
            let changed = false;
            const updatedTasks = [];
            for (const task of srv.scheduledTasks) {
              if (task.enabled && (!task.nextRunAt || now >= task.nextRunAt)) {
                const intervalMs = Math.max(5, Number(task.intervalMinutes || 60)) * 60 * 1000;
                task.lastRunAt = now;
                task.nextRunAt = now + intervalMs;
                changed = true;
                try {
                  if (task.action === 'restart') {
                    await restartServer(srv.id, 'scheduler');
                  } else if (task.action === 'backup') {
                    await createServerBackupZip(srv, 'Otomatik Zamanlı Yedek');
                  } else if (task.action === 'command' && task.payload) {
                    sendConsoleCommand(srv.id, task.payload);
                  }
                } catch (e) {
                  console.warn(`[Scheduler] Task ${task.id} failed for ${srv.id}:`, e.message);
                }
              }
              updatedTasks.push(task);
            }
            if (changed) {
              await db.collection('servers').doc(srv.id).update({ scheduledTasks: updatedTasks });
            }
          }
        }
      }

      // Auto-draw expired giveaways cryptographically
      const giveawaySnap = await db.collection('giveaways').where('status', '==', 'active').get();
      for (const gDoc of giveawaySnap.docs) {
        const gData = gDoc.data();
        if (gData.endsAt && now >= gData.endsAt) {
          await drawGiveawayWinners(gDoc.id, 'scheduler').catch(() => {});
        }
      }
    } catch (err) {
      // Ignore if emulator not started yet
    }
  });
}
