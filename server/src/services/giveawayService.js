import crypto from 'crypto';
import { db, writeAuditLog } from './firebase.js';
import { sendDiscordWebhook } from './webhook.js';
import { pushUserNotification } from './notifications.js';

/**
 * Cryptographically picks winnerCount unique winners from giveaway entries,
 * credits balance prizes automatically if prizeType === 'balance' (or creates user coupon for 'coupon'),
 * and sends notifications + Discord announcement.
 */
export async function drawGiveawayWinners(giveawayId, actorEmail = 'scheduler') {
  const gRef = db.collection('giveaways').doc(giveawayId);
  const gSnap = await gRef.get();
  if (!gSnap.exists) throw new Error('Çekiliş bulunamadı');
  const g = gSnap.data();

  if (g.status === 'drawn') {
    return { alreadyDrawn: true, winners: g.winners || [] };
  }

  const entriesSnap = await gRef.collection('entries').get();
  const pool = entriesSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));

  if (pool.length === 0) {
    await gRef.update({
      status: 'drawn',
      winners: [],
      drawnAt: Date.now(),
      drawnBy: actorEmail,
    });
    return { winners: [], emptyPool: true };
  }

  const targetCount = Math.min(pool.length, Math.max(1, Number(g.winnerCount || 1)));
  const remaining = [...pool];
  const selected = [];

  for (let i = 0; i < targetCount; i += 1) {
    const idx = crypto.randomInt(0, remaining.length);
    selected.push(remaining.splice(idx, 1)[0]);
  }

  const now = Date.now();
  const winners = [];

  for (const entry of selected) {
    let rewardNote = g.prizeLabel || `${g.prizeValue || 0}`;
    if (g.prizeType === 'balance' && Number(g.prizeValue) > 0) {
      const amount = Number(g.prizeValue);
      await db.runTransaction(async (tx) => {
        const uRef = db.collection('users').doc(entry.uid);
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists) return;
        const curr = Number(uSnap.data()?.balance || 0);
        tx.update(uRef, {
          balance: Number((curr + amount).toFixed(2)),
          xp: Number(uSnap.data()?.xp || 0) + 150,
        });
        tx.set(db.collection('wallet_transactions').doc(), {
          uid: entry.uid,
          email: entry.email || uSnap.data()?.email || '',
          type: 'giveaway_prize',
          amount,
          note: `Çekiliş Ödülü: ${g.title}`,
          adminEmail: actorEmail,
          createdAt: now,
        });
      });
      rewardNote = `+${amount} İnvite Bakiye`;
    } else if (g.prizeType === 'coupon') {
      const code = `CEKILIS-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const pct = Math.min(90, Math.max(5, Number(g.prizeValue || 25)));
      await db.collection('coupons').doc(code).set({
        code,
        discountType: 'percent',
        value: pct,
        minAmount: 0,
        maxUses: 1,
        usedCount: 0,
        ownerUid: entry.uid,
        source: 'giveaway',
        categoryFilter: 'all',
        active: true,
        expiresAt: now + 30 * 24 * 60 * 60 * 1000,
        createdBy: actorEmail,
        createdAt: now,
      });
      rewardNote = `%${pct} İndirim Kuponu (${code})`;
    }

    await pushUserNotification({
      uid: entry.uid,
      title: '🏆 Tebrikler! Çekiliş Kazandınız!',
      message: `"${g.title}" çekilişini kazandınız! Ödülünüz (${rewardNote}) hesabınıza tanımlandı.`,
      type: 'giveaway_win',
      createdBy: actorEmail,
      meta: { giveawayId, rewardNote },
    });

    winners.push({
      uid: entry.uid,
      email: entry.email || '',
      displayName: entry.displayName || 'Üye',
      rewardNote,
    });
  }

  await gRef.update({
    status: 'drawn',
    winners,
    drawnAt: now,
    drawnBy: actorEmail,
  });

  await writeAuditLog({
    actorEmail,
    action: 'GIVEAWAY_DRAWN',
    targetType: 'giveaway',
    targetId: giveawayId,
    details: { title: g.title, winners: winners.map((w) => w.email || w.uid) },
  });

  sendDiscordWebhook({
    title: 'Çekiliş Sonuçlandı!',
    description: `**${g.title}** çekilişinin kazananları açıklandı!`,
    color: 0xf59e0b,
    fields: [
      { name: 'Ödül', value: g.prizeLabel || String(g.prizeValue), inline: true },
      { name: 'Kazananlar', value: winners.map((w) => w.displayName).join(', '), inline: true },
    ],
  });

  return { ok: true, winners };
}
