import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { TicketSupportIcon, PlusIcon } from '../components/icons/EmoIcons';

export function TicketsPage() {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [servers, setServers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [replyBusy, setReplyBusy] = useState(false);
  const [closingBusy, setClosingBusy] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'teknik', priority: 'normal', serverId: '', message: '' });

  const loadTickets = useCallback(async () => {
    try {
      const [tData, sData] = await Promise.all([apiRequest('/api/tickets'), apiRequest('/api/servers')]);
      setTickets(tData.tickets || []);
      setServers(sData.servers || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (firebaseUser) loadTickets();
  }, [firebaseUser, loadTickets]);

  useEffect(() => {
    if (!creating) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setCreating(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);

  async function openTicket(id) {
    try {
      const data = await apiRequest(`/api/tickets/${id}`);
      setSelected(data.ticket);
      setMessages(data.messages || []);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function createTicket(e) {
    e.preventDefault();
    if (creatingBusy) return;
    setCreatingBusy(true);
    try {
      const res = await apiRequest('/api/tickets', { method: 'POST', body: form });
      toast.success('Destek talebiniz oluşturuldu!');
      setCreating(false);
      setForm({ subject: '', category: 'teknik', priority: 'normal', serverId: '', message: '' });
      await loadTickets();
      openTicket(res.id);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingBusy(false);
    }
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!selected || !replyText.trim() || replyBusy) return;
    setReplyBusy(true);
    try {
      await apiRequest(`/api/tickets/${selected.id}/reply`, { method: 'POST', body: { text: replyText } });
      setReplyText('');
      await openTicket(selected.id);
      await loadTickets();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReplyBusy(false);
    }
  }

  async function closeTicket() {
    if (!selected || closingBusy) return;
    setClosingBusy(true);
    try {
      await apiRequest(`/api/tickets/${selected.id}/close`, { method: 'POST' });
      toast.info('Talep kapatıldı.');
      await openTicket(selected.id);
      await loadTickets();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClosingBusy(false);
    }
  }

  const badge = (st) =>
    st === 'answered'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
      : st === 'closed'
      ? 'bg-zinc-800 text-zinc-400 border-white/10'
      : 'bg-amber-500/15 text-amber-300 border-amber-500/30';

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-6">
      <SeoHead title="Destek Talepleri" noIndex />

      <div className="glass-panel rounded-2xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
            <TicketSupportIcon className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-white">Destek Talepleri</h1>
            <p className="text-xs text-zinc-400">Tüm talepler ve yanıtlar anlık olarak hesabınıza işlenir.</p>
          </div>
        </div>
        <AnimatedButton variant="primary" onClick={() => setCreating(true)}>
          <PlusIcon className="w-4 h-4" />
          <span>Yeni Destek Talebi</span>
        </AnimatedButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          {tickets.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center text-sm text-zinc-400">
              Henüz destek talebiniz yok.
            </div>
          ) : (
            tickets.map((t) => (
              <button
                type="button"
                key={t.id}
                onClick={() => openTicket(t.id)}
                className={`w-full text-left cursor-pointer glass-panel rounded-2xl p-4 border transition ${
                  selected?.id === t.id ? 'border-amber-500/50 bg-amber-500/[0.08]' : 'hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-white truncate">{t.subject}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${badge(t.status)}`}>
                    {t.status === 'answered' ? 'YANITLANDI' : t.status === 'closed' ? 'KAPALI' : 'AÇIK'}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-1.5 flex justify-between">
                  <span className="capitalize">{t.category} • {t.priority}</span>
                  <span className="font-mono">{new Date(t.updatedAt || t.createdAt).toLocaleDateString('tr-TR')}</span>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="lg:col-span-8 glass-panel rounded-2xl p-5 sm:p-6 min-h-[460px] flex flex-col justify-between">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-sm text-zinc-400 text-center px-4">
              Görüntülemek için soldan bir destek talebi seçin veya yeni talep açın.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
                <div>
                  <h3 className="font-display text-xl font-bold text-white">{selected.subject}</h3>
                  <div className="text-xs text-zinc-400 capitalize">
                    Kategori: {selected.category} • Öncelik: {selected.priority}
                  </div>
                </div>
                {selected.status !== 'closed' && (
                  <AnimatedButton size="xs" variant="danger" loading={closingBusy} onClick={closeTicket}>
                    Talebi Kapat
                  </AnimatedButton>
                )}
              </div>

              <div className="flex-1 py-4 space-y-3 max-h-[340px] overflow-y-auto pr-1">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-2xl max-w-[85%] text-sm ${
                      m.isStaff
                        ? 'bg-zinc-900 border border-amber-500/35 text-zinc-100 mr-auto'
                        : 'bg-amber-500/15 border border-amber-500/30 text-amber-50 ml-auto'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 text-[11px] opacity-75 mb-1">
                      <span className="font-bold text-amber-300">{m.senderName}</span>
                      <span className="font-mono">{new Date(m.createdAt).toLocaleTimeString('tr-TR')}</span>
                    </div>
                    <div className="whitespace-pre-wrap">{m.text}</div>
                  </div>
                ))}
              </div>

              {selected.status !== 'closed' && (
                <form onSubmit={sendReply} className="pt-3 border-t border-white/[0.08] flex gap-2">
                  <label htmlFor="ticket-reply-input" className="sr-only">Destek yanıtınız</label>
                  <input
                    id="ticket-reply-input"
                    required
                    maxLength={4000}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Yanıtınızı yazın..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 focus:border-amber-500/60 outline-none text-sm text-white"
                  />
                  <AnimatedButton type="submit" variant="primary" loading={replyBusy}>Gönder</AnimatedButton>
                </form>
              )}
            </>
          )}
        </div>
      </div>

      {creating && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-ticket-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCreating(false)}
        >
          <form onSubmit={createTicket} onClick={(e) => e.stopPropagation()} className="glass-panel max-w-lg w-full rounded-2xl p-6 space-y-4 border-amber-500/30">
            <h3 id="new-ticket-modal-title" className="font-display text-xl font-bold text-white">Yeni Destek Talebi</h3>
            <div>
              <label htmlFor="ticket-subject" className="sr-only">Konu başlığı</label>
              <input
                id="ticket-subject"
                required
                minLength={3}
                maxLength={120}
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Konu başlığı"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select
                aria-label="Talep Kategorisi"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white"
              >
                <option value="teknik">Teknik Destek</option>
                <option value="minecraft">Minecraft</option>
                <option value="web">Website Host</option>
                <option value="discord">Discord Bot</option>
                <option value="bakiye">Bakiye &amp; Hesap</option>
              </select>
              <select
                aria-label="Talep Önceliği"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white"
              >
                <option value="low">Düşük Öncelik</option>
                <option value="normal">Normal Öncelik</option>
                <option value="high">Acil / Yüksek</option>
              </select>
            </div>
            {servers.length > 0 && (
              <select
                aria-label="İlgili Sunucu"
                value={form.serverId}
                onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white"
              >
                <option value="">İlgili Sunucu Seçin (İsteğe Bağlı)</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.category})
                  </option>
                ))}
              </select>
            )}
            <div>
              <label htmlFor="ticket-message" className="sr-only">Sorununuzu detaylı anlatın</label>
              <textarea
                id="ticket-message"
                required
                minLength={5}
                maxLength={4000}
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Sorununuzu detaylı anlatın..."
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm text-white outline-none focus:border-amber-500/50"
              />
            </div>
            <div className="flex justify-end gap-2">
              <AnimatedButton type="button" variant="ghost" onClick={() => setCreating(false)}>İptal</AnimatedButton>
              <AnimatedButton type="submit" variant="primary" loading={creatingBusy}>Talep Oluştur</AnimatedButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
