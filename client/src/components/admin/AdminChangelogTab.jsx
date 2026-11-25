import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon, PlusIcon, MegaphoneIcon, PluginSparkIcon } from '../icons/EmoIcons';

export function AdminChangelogTab({ onRefresh }) {
  const toast = useToast();
  const [changelogs, setChangelogs] = useState([]);
  const [form, setForm] = useState({
    version: 'v3.2.0',
    title: '',
    summary: '',
    itemsText: '',
    category: 'feature',
    notifyAll: true,
  });
  const [saving, setSaving] = useState(false);

  const [broadcast, setBroadcast] = useState({
    title: '',
    message: '',
    type: 'info',
  });
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiRequest(`${ADMIN_API_PREFIX}/changelogs`);
      setChangelogs(d.changelogs || []);
    } catch {}
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/changelogs`, { method: 'POST', body: form });
      toast.success('Güncelleme notu yayınlandı! Siteye giren kullanıcılara modal olarak gösterilecek.');
      setForm({ ...form, title: '', summary: '', itemsText: '' });
      await load();
      onRefresh?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    await apiRequest(`${ADMIN_API_PREFIX}/changelogs/${item.id}`, {
      method: 'PATCH',
      body: { active: !item.active },
    });
    toast.info(item.active ? 'Güncelleme notu gizlendi' : 'Güncelleme notu aktifleştirildi');
    await load();
    onRefresh?.();
  }

  async function removeItem(id) {
    await apiRequest(`${ADMIN_API_PREFIX}/changelogs/${id}`, { method: 'DELETE' });
    toast.info('Güncelleme notu silindi');
    await load();
    onRefresh?.();
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    if (!broadcast.title.trim() || !broadcast.message.trim()) return;
    setSendingBroadcast(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/notifications/broadcast`, {
        method: 'POST',
        body: broadcast,
      });
      toast.success('Toplu bildirim tüm üyelere gönderildi!');
      setBroadcast({ title: '', message: '', type: 'info' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingBroadcast(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Create Changelog */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <PluginSparkIcon className="w-5 h-5 text-amber-400" />
          <div>
            <h3 className="font-display text-xl font-bold text-white">Güncelleme Notları (Modal Yayınla)</h3>
            <p className="text-xs text-zinc-400">
              Buradan eklediğiniz aktif güncelleme notu, siteye giren tüm kullanıcılara şık bir modal pencere olarak gösterilir.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              required
              value={form.version}
              onChange={(e) => setForm({ ...form, version: e.target.value })}
              placeholder="Sürüm (örn: v3.2.0)"
              className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
            >
              <option value="feature">Yeni Özellik</option>
              <option value="fix">İyileştirme / Düzeltme</option>
              <option value="security">Güvenlik</option>
              <option value="maintenance">Bakım</option>
            </select>
            <input
              required
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Başlık (örn: Gece Pazarı & Yeni Panel)"
              className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
            />
          </div>

          <input
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="Kısa özet açıklaması..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
          />

          <textarea
            rows={4}
            value={form.itemsText}
            onChange={(e) => setForm({ ...form, itemsText: e.target.value })}
            placeholder="Her satıra bir yenilik maddesi yazın..."
            className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={form.notifyAll}
                onChange={(e) => setForm({ ...form, notifyAll: e.target.checked })}
              />
              <span>Yayınlandığında tüm üyelere bildirim gönder</span>
            </label>
            <AnimatedButton type="submit" size="sm" variant="primary" loading={saving}>
              <PlusIcon className="w-4 h-4" />
              <span>Güncelleme Notunu Yayınla</span>
            </AnimatedButton>
          </div>
        </form>
      </div>

      {/* Existing Changelogs */}
      <div className="glass-panel rounded-3xl p-6 space-y-3 text-xs">
        <h3 className="font-display text-lg font-bold text-white">Yayınlanan Güncelleme Notları ({changelogs.length})</h3>
        {changelogs.length === 0 ? (
          <p className="text-zinc-500 py-4">Henüz güncelleme notu eklenmedi.</p>
        ) : (
          <div className="space-y-2.5">
            {changelogs.map((cl) => (
              <div key={cl.id} className="p-4 rounded-2xl bg-zinc-950/70 border border-white/[0.08] flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      {cl.version}
                    </span>
                    <span className="font-bold text-white text-sm">{cl.title}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cl.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                      {cl.active ? 'Aktif (Modalda Görünür)' : 'Pasif'}
                    </span>
                  </div>
                  {cl.summary && <p className="text-zinc-400">{cl.summary}</p>}
                  {Array.isArray(cl.items) && cl.items.length > 0 && (
                    <ul className="list-disc list-inside text-zinc-400 pt-1 space-y-0.5">
                      {cl.items.map((x, idx) => (
                        <li key={idx}>{x}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <AnimatedButton size="xs" variant="secondary" onClick={() => toggleActive(cl)}>
                    {cl.active ? 'Pasife Al' : 'Aktifleştir'}
                  </AnimatedButton>
                  <button onClick={() => removeItem(cl.id)} className="p-1.5 text-rose-400 hover:text-rose-300">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Broadcast Notification */}
      <form onSubmit={sendBroadcast} className="glass-panel rounded-3xl p-6 space-y-3 text-xs">
        <div className="flex items-center gap-2">
          <MegaphoneIcon className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-lg font-bold text-white">Anlık Toplu Bildirim Gönder</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            required
            value={broadcast.title}
            onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })}
            placeholder="Bildirim Başlığı"
            className="px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
          />
          <input
            required
            value={broadcast.message}
            onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })}
            placeholder="Bildirim mesajı..."
            className="sm:col-span-2 px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-white"
          />
        </div>
        <AnimatedButton type="submit" size="sm" variant="emerald" loading={sendingBroadcast}>
          Tüm Kullanıcılara Bildirim Gönder
        </AnimatedButton>
      </form>
    </div>
  );
}
