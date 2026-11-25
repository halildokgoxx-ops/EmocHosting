import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon } from '../icons/EmoIcons';

export function AdminTicketsTab({ tickets, onRefresh }) {
  const toast = useToast();
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState('');
  const [canned, setCanned] = useState([]);
  const [newCanned, setNewCanned] = useState({ title: '', text: '' });
  const [internalNote, setInternalNote] = useState('');

  useEffect(() => {
    apiRequest(`${ADMIN_API_PREFIX}/canned-responses`).then((d) => setCanned(d.items || [])).catch(() => {});
  }, []);

  async function openTicket(t) {
    const data = await apiRequest(`/api/tickets/${t.id}`);
    setSelected(data.ticket);
    setMessages(data.messages || []);
    setInternalNote(data.ticket.internalNote || '');
  }

  async function sendReply(e) {
    e.preventDefault();
    if (!selected || !replyText.trim()) return;
    await apiRequest(`/api/tickets/${selected.id}/reply`, { method: 'POST', body: { text: replyText } });
    setReplyText('');
    await openTicket(selected);
    onRefresh();
    toast.success('Yanıt gönderildi!');
  }

  async function updateMeta(patch) {
    await apiRequest(`${ADMIN_API_PREFIX}/tickets/${selected.id}`, { method: 'PATCH', body: patch });
    await openTicket(selected);
    onRefresh();
    toast.success('Talep güncellendi');
  }

  async function createCanned(e) {
    e.preventDefault();
    if (!newCanned.title || !newCanned.text) return;
    await apiRequest(`${ADMIN_API_PREFIX}/canned-responses`, { method: 'POST', body: newCanned });
    setNewCanned({ title: '', text: '' });
    const d = await apiRequest(`${ADMIN_API_PREFIX}/canned-responses`);
    setCanned(d.items || []);
    toast.success('Hazır yanıt eklendi');
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => openTicket(t)}
              className={`cursor-pointer p-4 rounded-2xl glass-panel border transition text-xs ${
                selected?.id === t.id ? 'border-amber-500/50 bg-amber-500/10' : 'hover:border-white/20'
              }`}
            >
              <div className="flex justify-between items-center gap-2">
                <span className="font-bold text-white truncate">{t.subject}</span>
                <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] uppercase">{t.status}</span>
              </div>
              <div className="text-zinc-400 mt-1">{t.email} • {t.priority}</div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-8 glass-panel rounded-3xl p-6 space-y-4">
          {!selected ? (
            <div className="py-20 text-center text-sm text-zinc-400">İncelemek için soldan bir destek talebi seçin.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-display text-lg font-bold text-white">{selected.subject}</h3>
                  <div className="text-xs text-zinc-400">{selected.email} • Kategori: {selected.category}</div>
                </div>
                <div className="flex gap-2">
                  <select
                    value={selected.status}
                    onChange={(e) => updateMeta({ status: e.target.value })}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
                  >
                    <option value="open">Açık</option>
                    <option value="answered">Yanıtlandı</option>
                    <option value="closed">Kapalı</option>
                  </select>
                  <select
                    value={selected.priority}
                    onChange={(e) => updateMeta({ priority: e.target.value })}
                    className="px-2.5 py-1.5 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
                  >
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2.5 max-h-60 overflow-y-auto">
                {messages.map((m) => (
                  <div key={m.id} className={`p-3 rounded-xl text-xs ${m.isStaff ? 'bg-zinc-900 border border-amber-500/25 ml-8' : 'bg-white/5 mr-8'}`}>
                    <div className="font-bold text-amber-300 mb-1">{m.senderName} ({new Date(m.createdAt).toLocaleTimeString('tr-TR')})</div>
                    <div className="text-zinc-200 whitespace-pre-wrap">{m.text}</div>
                  </div>
                ))}
              </div>

              {canned.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {canned.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setReplyText(c.text)}
                      className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-cyan-400/25 text-[11px] text-amber-200"
                    >
                      Şablon: {c.title}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={sendReply} className="flex gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Yetkili yanıtı yazın..."
                  className="flex-1 px-4 py-2 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
                />
                <AnimatedButton type="submit" size="sm">Yanıtla</AnimatedButton>
              </form>

              <div className="flex gap-2 pt-2 border-t border-white/10">
                <input
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Yönetici iç notu (kullanıcı görmez)..."
                  className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-amber-200"
                />
                <AnimatedButton size="xs" variant="secondary" onClick={() => updateMeta({ internalNote })}>Notu Kaydet</AnimatedButton>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Canned Responses Manager */}
      <div className="glass-panel rounded-3xl p-6 space-y-3 text-xs">
        <h4 className="font-bold text-white text-sm">Hazır Destek Yanıt Şablonları</h4>
        <form onSubmit={createCanned} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input value={newCanned.title} onChange={(e) => setNewCanned({ ...newCanned, title: e.target.value })} placeholder="Şablon Adı" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input value={newCanned.text} onChange={(e) => setNewCanned({ ...newCanned, text: e.target.value })} placeholder="Hazır Yanıt Metni" className="sm:col-span-2 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <AnimatedButton type="submit" size="xs">Şablon Ekle</AnimatedButton>
        </form>
        <div className="flex flex-wrap gap-2">
          {canned.map((c) => (
            <div key={c.id} className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
              <span className="font-bold text-amber-200">{c.title}</span>
              <button
                onClick={() => apiRequest(`${ADMIN_API_PREFIX}/canned-responses/${c.id}`, { method: 'DELETE' }).then(() => setCanned((p) => p.filter((x) => x.id !== c.id)))}
                className="text-rose-400"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
