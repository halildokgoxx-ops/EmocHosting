import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { WalletCoinIcon, BanHammerIcon, ShieldAdminIcon } from '../icons/EmoIcons';

export function AdminUsersTab({ users, isOwner, onRefresh }) {
  const toast = useToast();
  const { currencyLabel } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [activeUser, setActiveUser] = useState(null);
  const [balMode, setBalMode] = useState('add');
  const [balAmount, setBalAmount] = useState('100');
  const [balNote, setBalNote] = useState('Admin Bakiye Yüklemesi');
  const [banReason, setBanReason] = useState('Kural ihlali');
  const [banHours, setBanHours] = useState('0');
  const [badgesInput, setBadgesInput] = useState('');
  const [xpDelta, setXpDelta] = useState('0');
  const [userNote, setUserNote] = useState('');
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBonus, setBulkBonus] = useState({ balanceBonus: '25', xpBonus: '50', note: 'EmoçHosting Etkinlik Bonusu' });
  const [sendingBulk, setSendingBulk] = useState(false);

  async function sendBulkBonus(e) {
    e.preventDefault();
    setSendingBulk(true);
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/users/bulk-bonus`, {
        method: 'POST',
        body: {
          balanceBonus: Number(bulkBonus.balanceBonus || 0),
          xpBonus: Number(bulkBonus.xpBonus || 0),
          note: bulkBonus.note,
        },
      });
      toast.success(`${res.count} aktif üyeye etkinlik bonusu dağıtıldı!`);
      setBulkOpen(false);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSendingBulk(false);
    }
  }

  const filtered = users.filter((u) => {
    const matchText =
      !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.referralCode?.toLowerCase().includes(search.toLowerCase());
    if (filter === 'banned') return matchText && u.banned;
    if (filter === 'admins') return matchText && (u.isAdmin || u.isOwner);
    return matchText;
  });

  async function submitBalance(e) {
    e.preventDefault();
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/users/${activeUser.uid}/balance`, {
        method: 'POST',
        body: { mode: balMode, amount: Number(balAmount), note: balNote },
      });
      toast.success(`Yeni bakiye: ${res.balance} ${currencyLabel}`);
      setActiveUser((u) => ({ ...u, balance: res.balance }));
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleBan(u, banned) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/users/${u.uid}/ban`, {
        method: 'POST',
        body: { banned, reason: banReason, hours: Number(banHours || 0) },
      });
      toast.success(banned ? `${u.email} yasaklandı` : `${u.email} yasağı kaldırıldı`);
      setActiveUser(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleAdmin(u, nextAdmin) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/users/${u.uid}/admin`, {
        method: 'POST',
        body: { isAdmin: nextAdmin },
      });
      toast.success(nextAdmin ? `${u.email} Admin yapıldı!` : `${u.email} Admin yetkisi alındı`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveBadgesAndNote() {
    const badges = badgesInput.split(',').map((b) => b.trim()).filter(Boolean);
    await Promise.all([
      apiRequest(`${ADMIN_API_PREFIX}/users/${activeUser.uid}/badges`, { method: 'POST', body: { badges, xpDelta: Number(xpDelta || 0) } }),
      apiRequest(`${ADMIN_API_PREFIX}/users/${activeUser.uid}/note`, { method: 'POST', body: { notes: userNote } }),
    ]);
    toast.success('Rozet, XP ve not güncellendi!');
    onRefresh();
  }

  async function generateResetLink(uid) {
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/users/${uid}/reset-link`, { method: 'POST' });
      navigator.clipboard.writeText(res.link);
      toast.success('Şifre sıfırlama linki panoya kopyalandı!');
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="E-posta, ad veya davet kodu ara..."
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
        />
        <AnimatedButton size="xs" variant="primary" onClick={() => setBulkOpen((v) => !v)}>
          🎁 Toplu Etkinlik Bonusu
        </AnimatedButton>
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
          {[
            { id: 'all', label: `Tümü (${users.length})` },
            { id: 'admins', label: 'Adminler' },
            { id: 'banned', label: 'Banlılar' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1 rounded-lg font-bold ${filter === f.id ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {bulkOpen && (
        <form onSubmit={sendBulkBonus} className="glass-panel rounded-2xl p-5 border-amber-500/35 grid grid-cols-1 sm:grid-cols-5 gap-3 items-end text-xs">
          <div>
            <label className="text-zinc-400 block mb-1">Bonus Bakiye ({currencyLabel})</label>
            <input type="number" step="0.01" min="0" value={bulkBonus.balanceBonus} onChange={(e) => setBulkBonus({ ...bulkBonus, balanceBonus: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Bonus XP</label>
            <input type="number" min="0" value={bulkBonus.xpBonus} onChange={(e) => setBulkBonus({ ...bulkBonus, xpBonus: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-zinc-400 block mb-1">Açıklama</label>
            <input value={bulkBonus.note} onChange={(e) => setBulkBonus({ ...bulkBonus, note: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <AnimatedButton type="submit" size="xs" variant="emerald" loading={sendingBulk}>
            Tüm Üyelere Gönder
          </AnimatedButton>
        </form>
      )}

      {/* Mobile Cards (< md) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.map((u) => (
          <div key={u.uid} className="glass-panel rounded-2xl p-4 space-y-2.5 text-xs">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <div className="font-bold text-white truncate">{u.displayName}</div>
                <div className="font-mono text-zinc-400 truncate">{u.email}</div>
              </div>
              <span className="font-mono font-bold text-emerald-300 shrink-0">{Number(u.balance || 0).toFixed(2)} {currencyLabel}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <AnimatedButton
                size="xs"
                variant="emerald"
                onClick={() => {
                  setActiveUser(u);
                  setBadgesInput((u.badges || []).join(', '));
                  setUserNote(u.notes || '');
                  setXpDelta('0');
                }}
              >
                Bakiye &amp; Yönet
              </AnimatedButton>
              {isOwner && !u.isOwner && (
                <AnimatedButton size="xs" variant={u.isAdmin ? 'warning' : 'secondary'} onClick={() => toggleAdmin(u, !u.isAdmin)}>
                  {u.isAdmin ? 'Admin Al' : 'Admin Yap'}
                </AnimatedButton>
              )}
              {!u.isOwner && (
                <AnimatedButton size="xs" variant={u.banned ? 'secondary' : 'danger'} onClick={() => toggleBan(u, !u.banned)}>
                  {u.banned ? 'Ban Aç' : 'Banla'}
                </AnimatedButton>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block glass-panel rounded-3xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 text-zinc-400 uppercase">
            <tr>
              <th className="p-4">Kullanıcı</th>
              <th className="p-4">Yetki &amp; Durum</th>
              <th className="p-4">Bakiye / Harcama</th>
              <th className="p-4">Sunucu / Davet / XP</th>
              <th className="p-4 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((u) => (
              <tr key={u.uid} className="hover:bg-white/5">
                <td className="p-4">
                  <div className="font-bold text-white">{u.displayName}</div>
                  <div className="font-mono text-zinc-400">{u.email}</div>
                  <div className="text-[10px] text-zinc-500">Kod: {u.referralCode} • IP: {u.lastIp || '-'}</div>
                </td>
                <td className="p-4 space-y-1">
                  <div className="flex flex-wrap gap-1">
                    {u.isOwner && <span className="px-2 py-0.5 rounded bg-rose-500/25 text-rose-200 font-bold text-[10px]">KURUCU</span>}
                    {u.isAdmin && !u.isOwner && <span className="px-2 py-0.5 rounded bg-violet-500/25 text-violet-200 font-bold text-[10px]">ADMİN</span>}
                    {u.banned && <span className="px-2 py-0.5 rounded bg-red-600/30 text-red-200 font-bold text-[10px]">BANLI</span>}
                    {(u.badges || []).map((b) => (
                      <span key={b} className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-200 text-[10px]">{b}</span>
                    ))}
                  </div>
                </td>
                <td className="p-4 font-mono">
                  <div className="text-emerald-300 font-bold">{Number(u.balance || 0).toFixed(2)} {currencyLabel}</div>
                  <div className="text-zinc-500">Harcama: {u.totalSpent || 0} {currencyLabel}</div>
                </td>
                <td className="p-4 font-mono text-zinc-300">
                  {u.serverCount || 0} Sunucu • {u.referralCount || 0} Davet • {u.xp || 0} XP
                </td>
                <td className="p-4">
                  <div className="flex items-center justify-end gap-1.5 flex-wrap">
                    <AnimatedButton
                      size="xs"
                      variant="emerald"
                      onClick={() => {
                        setActiveUser(u);
                        setBadgesInput((u.badges || []).join(', '));
                        setUserNote(u.notes || '');
                        setXpDelta('0');
                      }}
                    >
                      <WalletCoinIcon className="w-3.5 h-3.5" /> Bakiye &amp; Yönet
                    </AnimatedButton>
                    {isOwner && !u.isOwner && (
                      <AnimatedButton
                        size="xs"
                        variant={u.isAdmin ? 'warning' : 'secondary'}
                        onClick={() => toggleAdmin(u, !u.isAdmin)}
                      >
                        <ShieldAdminIcon className="w-3.5 h-3.5" />
                        {u.isAdmin ? 'Admin Al' : 'Admin Yap'}
                      </AnimatedButton>
                    )}
                    {!u.isOwner && (
                      <AnimatedButton
                        size="xs"
                        variant={u.banned ? 'secondary' : 'danger'}
                        onClick={() => toggleBan(u, !u.banned)}
                      >
                        <BanHammerIcon className="w-3.5 h-3.5" />
                        {u.banned ? 'Ban Aç' : 'Banla'}
                      </AnimatedButton>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User 360 & Balance Modal */}
      {activeUser && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setActiveUser(null)}>
          <div className="glass-panel max-w-xl w-full rounded-3xl p-6 space-y-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-display text-xl font-bold text-white">{activeUser.displayName}</h3>
                <div className="text-xs font-mono text-amber-300">{activeUser.email} • Mevcut: {activeUser.balance} {currencyLabel}</div>
                <div className="text-[11px] font-mono text-zinc-500 mt-1">
                  IP: {activeUser.lastIp || '-'} • Kayıt: {activeUser.createdAt ? new Date(activeUser.createdAt).toLocaleDateString('tr-TR') : '-'} • ToS: {activeUser.acceptedTermsAt ? 'Evet' : 'Hayır'}
                </div>
              </div>
              {isOwner && (
                <AnimatedButton size="xs" variant="ghost" onClick={() => generateResetLink(activeUser.uid)}>
                  Şifre Sıfırlama Linki
                </AnimatedButton>
              )}
            </div>

            {/* Balance Editor */}
            <form onSubmit={submitBalance} className="p-4 rounded-2xl bg-zinc-950/70 border border-emerald-400/25 space-y-3">
              <div className="text-xs font-bold text-emerald-300">Admin Panelden Bakiye İşlemi</div>
              <div className="grid grid-cols-3 gap-2">
                <select value={balMode} onChange={(e) => setBalMode(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white">
                  <option value="add">+ Bakiye Ekle</option>
                  <option value="subtract">- Bakiye Düş</option>
                  <option value="set">= Bakiye Sabitle</option>
                </select>
                <input type="number" step="0.01" value={balAmount} onChange={(e) => setBalAmount(e.target.value)} className="px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white" />
                <AnimatedButton type="submit" size="xs" variant="emerald">Uygula</AnimatedButton>
              </div>
              <input value={balNote} onChange={(e) => setBalNote(e.target.value)} placeholder="İşlem açıklaması" className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white" />
            </form>

            {/* Badges, XP & Notes */}
            <div className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10 space-y-3 text-xs">
              <div className="font-bold text-white">Rozetler, XP &amp; Admin Notu</div>
              <div className="grid grid-cols-3 gap-2">
                <input value={badgesInput} onChange={(e) => setBadgesInput(e.target.value)} placeholder="VIP, Partner, Sponsor" className="col-span-2 px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-white" />
                <input type="number" value={xpDelta} onChange={(e) => setXpDelta(e.target.value)} placeholder="+/- XP" className="px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-white" />
              </div>
              <textarea rows={2} value={userNote} onChange={(e) => setUserNote(e.target.value)} placeholder="Admin iç notu" className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-white" />
              <AnimatedButton size="xs" onClick={saveBadgesAndNote}>Rozet &amp; Notu Kaydet</AnimatedButton>
            </div>

            {/* Ban Details */}
            {!activeUser.isOwner && (
              <div className="p-4 rounded-2xl bg-rose-950/25 border border-rose-400/25 space-y-2 text-xs">
                <div className="font-bold text-rose-300">Ban Yönetimi</div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Ban sebebi" className="px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-white" />
                  <input type="number" value={banHours} onChange={(e) => setBanHours(e.target.value)} placeholder="Saat (0 = Kalıcı)" className="px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-white" />
                </div>
                <AnimatedButton size="xs" variant="danger" onClick={() => toggleBan(activeUser, !activeUser.banned)}>
                  {activeUser.banned ? 'Kullanıcı Yasağını Kaldır' : 'Kullanıcıyı Yasakla & Sunucularını Durdur'}
                </AnimatedButton>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
