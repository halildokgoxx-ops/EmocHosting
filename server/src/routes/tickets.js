import express from 'express';
import { db } from '../services/firebase.js';
import { requireAuth } from '../middleware/auth.js';
import { sendDiscordWebhook } from '../services/webhook.js';
import { assertSafeDocId, sanitizeString } from '../utils/security.js';
import { createRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

const createTicketLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 8,
  keyFn: (req) => req.user?.uid || req.ip,
  message: 'Çok sık destek talebi açıyorsunuz. Lütfen bekleyin.',
});

const replyTicketLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 20,
  keyFn: (req) => req.user?.uid || req.ip,
});

const ALLOWED_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent', 'dusuk', 'yuksek', 'acil']);

router.get('/', requireAuth, async (req, res) => {
  try {
    const snap = await db.collection('tickets').where('uid', '==', req.user.uid).get();
    const tickets = snap.docs
      .map((d) => {
        const { internalNote: _hiddenNote, ...data } = d.data();
        return { id: d.id, ...data };
      })
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    res.json({ tickets });
  } catch {
    res.status(500).json({ error: 'Destek talepleri alınamadı' });
  }
});

router.post('/', requireAuth, createTicketLimiter, async (req, res) => {
  try {
    const rawSubject = sanitizeString(req.body?.subject, { minLen: 2, maxLen: 120 });
    const rawMessage = sanitizeString(req.body?.message, { minLen: 1, maxLen: 4000, allowNewlines: true });
    if (!rawSubject || !rawMessage) {
      return res.status(400).json({ error: 'Konu (en az 2 karakter) ve mesaj alanları zorunludur' });
    }

    const categoryRaw = sanitizeString(req.body?.category || 'genel', { minLen: 1, maxLen: 32 }) || 'genel';
    const category = /^[a-zA-Z0-9_-]{2,32}$/.test(categoryRaw) ? categoryRaw.toLowerCase() : 'genel';
    const priorityRaw = String(req.body?.priority || 'normal').trim().toLowerCase();
    const priority = ALLOWED_PRIORITIES.has(priorityRaw) ? priorityRaw : 'normal';

    let validServerId = null;
    if (req.body?.serverId) {
      validServerId = assertSafeDocId(req.body.serverId, 'sunucu kimliği');
      const srvSnap = await db.collection('servers').doc(validServerId).get();
      if (!srvSnap.exists) {
        return res.status(404).json({ error: 'İlişkili sunucu bulunamadı' });
      }
      const srvData = srvSnap.data();
      const isCollab = Array.isArray(srvData.collaborators) && srvData.collaborators.some((c) => c.uid === req.user.uid);
      if (srvData.ownerUid !== req.user.uid && !isCollab && !req.user.isAdmin) {
        return res.status(403).json({ error: 'Bu sunucu için destek talebi açma yetkiniz yok' });
      }
    }

    if (!req.user.isAdmin) {
      const existingSnap = await db.collection('tickets').where('uid', '==', req.user.uid).get();
      const activeCount = existingSnap.docs.filter((d) => d.data().status !== 'closed').length;
      if (activeCount >= 20) {
        return res.status(400).json({ error: 'Aynı anda en fazla 20 açık destek talebiniz olabilir.' });
      }
    }

    const now = Date.now();
    const ticketRef = await db.collection('tickets').add({
      uid: req.user.uid,
      email: req.user.email,
      displayName: req.user.displayName,
      subject: rawSubject,
      category,
      priority,
      serverId: validServerId,
      status: 'open',
      assignedTo: null,
      internalNote: '',
      createdAt: now,
      updatedAt: now,
    });

    await ticketRef.collection('messages').add({
      senderUid: req.user.uid,
      senderEmail: req.user.email,
      senderName: req.user.displayName,
      isStaff: false,
      text: rawMessage,
      createdAt: now,
    });

    sendDiscordWebhook({
      title: 'Yeni Destek Talebi Açıldı',
      description: `**${req.user.email}** yeni bir talep oluşturdu: **${rawSubject}**`,
      color: 0x00f0ff,
      fields: [
        { name: 'Kategori', value: category, inline: true },
        { name: 'Öncelik', value: priority, inline: true },
      ],
    });

    res.status(201).json({ ok: true, id: ticketRef.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const ticketId = assertSafeDocId(req.params.id, 'talep kimliği');
    const ticketRef = db.collection('tickets').doc(ticketId);
    const snap = await ticketRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Destek talebi bulunamadı' });

    const data = snap.data();
    if (data.uid !== req.user.uid && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Bu talebi görüntüleme yetkiniz yok' });
    }

    const msgSnap = await ticketRef.collection('messages').orderBy('createdAt', 'asc').get();
    const messages = msgSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const { internalNote: _rawNote, ...safeData } = data;
    let internalNote;
    if (req.user.isAdmin) {
      const noteSnap = await ticketRef.collection('internal_notes').doc('admin').get();
      internalNote = noteSnap.exists ? noteSnap.data()?.text || '' : '';
    }

    res.json({
      ticket: {
        id: snap.id,
        ...safeData,
        ...(req.user.isAdmin ? { internalNote } : {}),
      },
      messages,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/reply', requireAuth, replyTicketLimiter, async (req, res) => {
  try {
    const ticketId = assertSafeDocId(req.params.id, 'talep kimliği');
    const text = sanitizeString(req.body?.text, { minLen: 1, maxLen: 4000, allowNewlines: true });
    if (!text) return res.status(400).json({ error: 'Mesaj boş olamaz' });

    const ticketRef = db.collection('tickets').doc(ticketId);
    const snap = await ticketRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Talep bulunamadı' });
    const data = snap.data();

    if (data.uid !== req.user.uid && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Yetkisiz işlem' });
    }
    if (data.status === 'closed' && !req.user.isAdmin) {
      return res.status(400).json({ error: 'Kapatılmış destek talebine yanıt eklenemez' });
    }

    const now = Date.now();
    await ticketRef.collection('messages').add({
      senderUid: req.user.uid,
      senderEmail: req.user.email,
      senderName: req.user.isAdmin ? 'EmoçHosting Yetkili' : req.user.displayName,
      isStaff: Boolean(req.user.isAdmin),
      text,
      createdAt: now,
    });

    await ticketRef.update({
      status: req.user.isAdmin ? 'answered' : 'open',
      updatedAt: now,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:id/close', requireAuth, async (req, res) => {
  try {
    const ticketId = assertSafeDocId(req.params.id, 'talep kimliği');
    const ticketRef = db.collection('tickets').doc(ticketId);
    const snap = await ticketRef.get();
    if (!snap.exists) return res.status(404).json({ error: 'Talep bulunamadı' });
    if (snap.data().uid !== req.user.uid && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Yetkisiz' });
    }
    await ticketRef.update({ status: 'closed', updatedAt: Date.now() });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
