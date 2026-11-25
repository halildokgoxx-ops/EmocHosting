import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { CollaboratorsIcon, PlusIcon, TrashIcon } from '../icons/EmoIcons';

const PERM_LIST = [
  { id: 'power', label: 'Başlat / Durdur / Duraklat' },
  { id: 'console', label: 'Canlı Konsol & Komut' },
  { id: 'files', label: 'Dosya Yöneticisi & Modlar' },
  { id: 'backups', label: 'Yedekleme Yönetimi' },
  { id: 'settings', label: 'Ayarlar, Sürüm & MOTD' },
  { id: 'sftp', label: 'SFTP Bilgileri' },
];

export function CollaboratorsTab({ serverId, isServerOwner }) {
  const toast = useToast();
  const [collabs, setCollabs] = useState([]);
  const [email, setEmail] = useState('');
  const [perms, setPerms] = useState(['power', 'console', 'files']);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiRequest(`/api/servers/${serverId}/collaborators`)
      .then((d) => setCollabs(d.collaborators || []))
      .catch(() => {});
  }, [serverId]);

  function togglePerm(p) {
    setPerms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function addCollab(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/collaborators`, {
        method: 'POST',
        body: { email, permissions: perms },
      });
      setCollabs(res.collaborators || []);
      setEmail('');
      toast.success('Yetkili kullanıcı sunucuya eklendi!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleUserPerm(user, permId) {
    const next = user.permissions.includes(permId)
      ? user.permissions.filter((p) => p !== permId)
      : [...user.permissions, permId];
    try {
      const res = await apiRequest(`/api/servers/${serverId}/collaborators/${user.uid}`, {
        method: 'PATCH',
        body: { permissions: next },
      });
      setCollabs(res.collaborators || []);
      toast.success('Yetkiler güncellendi');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeCollab(uid) {
    try {
      const res = await apiRequest(`/api/servers/${serverId}/collaborators/${uid}`, { method: 'DELETE' });
      setCollabs(res.collaborators || []);
      toast.info('Kullanıcı sunucudan çıkarıldı');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-violet-500/10 border border-violet-400/25">
        <CollaboratorsIcon className="w-7 h-7 shrink-0" />
        <div>
          <h4 className="font-bold text-white text-sm">Sunucu Yetkilileri &amp; Alt Kullanıcılar</h4>
          <p className="text-xs text-slate-300">
            Eklediğiniz kayıtlı kullanıcılar kendi &quot;Sunucularım&quot; sayfasında bu sunucuyu görür ve izin verdiğiniz sekmeleri yönetebilir.
          </p>
        </div>
      </div>

      {isServerOwner && (
        <form onSubmit={addCollab} className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Yetki verilecek kullanıcının emoçhosting e-postası..."
              className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
            />
            <AnimatedButton type="submit" loading={busy} size="sm">
              <PlusIcon className="w-4 h-4" /> Yetkili Ekle
            </AnimatedButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            {PERM_LIST.map((p) => (
              <label key={p.id} className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <input type="checkbox" checked={perms.includes(p.id)} onChange={() => togglePerm(p.id)} />
                <span className="text-slate-200">{p.label}</span>
              </label>
            ))}
          </div>
        </form>
      )}

      <div className="space-y-3">
        {collabs.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-950/40 border border-white/10 text-center text-xs text-slate-500">
            Henüz bu sunucuya alt yetkili eklenmemiş.
          </div>
        ) : (
          collabs.map((c) => (
            <div key={c.uid} className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-sm text-white">{c.displayName}</div>
                  <div className="text-xs font-mono text-cyan-300">{c.email}</div>
                </div>
                {isServerOwner && (
                  <AnimatedButton size="xs" variant="danger" onClick={() => removeCollab(c.uid)}>
                    <TrashIcon className="w-3.5 h-3.5" /> Kaldır
                  </AnimatedButton>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PERM_LIST.map((p) => {
                  const has = c.permissions?.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={!isServerOwner}
                      onClick={() => toggleUserPerm(c, p.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition ${
                        has
                          ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                          : 'bg-white/5 border-white/10 text-slate-500'
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
