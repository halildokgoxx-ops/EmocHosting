import { db } from './firebase.js';

let _io = null;

export function setNotificationIO(io) {
  _io = io;
}

/**
 * Persists a notification in `user_notifications` and immediately pushes it
 * over Socket.IO to either `user:<uid>` or `all` broadcast room.
 * Respects per-user notification preferences on personal notifications.
 */
export async function pushUserNotification({
  uid,
  title,
  message,
  type = 'info',
  createdBy = 'system',
  meta = null,
}) {
  if (!uid || !title) return null;
  try {
    if (uid !== 'all') {
      const uSnap = await db.collection('users').doc(String(uid)).get();
      const prefs = uSnap.data()?.preferences || {};
      if (type === 'server_power' && prefs.serverPowerAlerts === false) return null;
      if ((type === 'giveaway_win' || type === 'giveaway_new') && prefs.giveawayAlerts === false) return null;
      if (type === 'wallet' && prefs.walletAlerts === false) return null;
    }

    const now = Date.now();
    const payload = {
      uid: String(uid),
      title: String(title).slice(0, 140),
      message: String(message || '').slice(0, 600),
      type: String(type || 'info'),
      createdBy: String(createdBy || 'system'),
      createdAt: now,
      ...(meta ? { meta } : {}),
    };
    const docRef = await db.collection('user_notifications').add(payload);
    const out = { id: docRef.id, ...payload };

    if (_io) {
      if (uid === 'all') {
        _io.to('all').emit('notification:new', out);
      } else {
        _io.to(`user:${uid}`).emit('notification:new', out);
      }
    }
    return out;
  } catch (err) {
    console.warn('[Notification] Failed to push:', err.message);
    return null;
  }
}
