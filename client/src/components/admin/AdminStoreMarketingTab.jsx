import React, { useState } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon, PlusIcon, CouponTagIcon, TrophyIcon } from '../icons/EmoIcons';

export function AdminStoreMarketingTab({ packages, coupons, invites, config, leaderboard, users = [], onRefresh }) {
  const toast = useToast();

  const [newPkg, setNewPkg] = useState({
    category: 'minecraft',
    name: '',
    description: '',
    priceDaily: 10,
    priceWeekly: 55,
    priceMonthly: 189,
    ramMb: 4096,
    cpuCores: 2,
    cpuLimitPct: 200,
    diskMb: 20480,
    slotsOrPorts: 50,
    backupsLimit: 5,
    badge: 'Yeni',
    featured: false,
  });

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discountType: 'percent',
    value: 20,
    minAmount: 0,
    maxUses: 100,
    categoryFilter: 'all',
  });

  const [promoForm, setPromoForm] = useState({
    inviteRewardInviter: config?.inviteRewardInviter ?? 25,
    inviteRewardInvited: config?.inviteRewardInvited ?? 15,
    invitePromoActive: config?.invitePromoActive !== false,
    flashSalePercent: config?.flashSalePercent ?? 0,
    flashSaleTitle: config?.flashSaleTitle || '',
    nightMarketEnabled: config?.nightMarketEnabled !== false,
    nightMarketCooldownDays: config?.nightMarketCooldownDays ?? 7,
    nightMarketBoxCount: config?.nightMarketBoxCount ?? 3,
  });

  const [giveaways, setGiveaways] = useState([]);
  const [newGiveaway, setNewGiveaway] = useState({
    title: '',
    description: '',
    prizeType: 'balance',
    prizeValue: 100,
    winnerCount: 1,
    durationHours: 48,
    minXp: 0,
  });

  React.useEffect(() => {
    apiRequest(`${ADMIN_API_PREFIX}/giveaways`).then((d) => setGiveaways(d.giveaways || [])).catch(() => {});
  }, []);

  async function createGiveaway(e) {
    e.preventDefault();
    await apiRequest(`${ADMIN_API_PREFIX}/giveaways`, { method: 'POST', body: newGiveaway });
    toast.success('Yeni çekiliş oluşturuldu!');
    setNewGiveaway({ ...newGiveaway, title: '', description: '' });
    const d = await apiRequest(`${ADMIN_API_PREFIX}/giveaways`);
    setGiveaways(d.giveaways || []);
  }

  async function drawGiveaway(id) {
    const res = await apiRequest(`${ADMIN_API_PREFIX}/giveaways/${id}/draw`, { method: 'POST' });
    toast.success(`Çekiliş tamamlandı! Kazanan sayısı: ${res.winners?.length || 0}`);
    const d = await apiRequest(`${ADMIN_API_PREFIX}/giveaways`);
    setGiveaways(d.giveaways || []);
    onRefresh();
  }

  async function createPackage(e) {
    e.preventDefault();
    await apiRequest(`${ADMIN_API_PREFIX}/packages`, { method: 'POST', body: newPkg });
    toast.success('Yeni paket eklendi!');
    setNewPkg({ ...newPkg, name: '', description: '' });
    onRefresh();
  }

  async function updatePkg(id, patch) {
    await apiRequest(`${ADMIN_API_PREFIX}/packages/${id}`, { method: 'PATCH', body: patch });
    toast.success('Paket güncellendi');
    onRefresh();
  }

  async function deletePkg(id) {
    if (!window.confirm('Paket kalıcı olarak silinsin mi?')) return;
    await apiRequest(`${ADMIN_API_PREFIX}/packages/${id}`, { method: 'DELETE' });
    toast.info('Paket silindi');
    onRefresh();
  }

  async function createCoupon(e) {
    e.preventDefault();
    await apiRequest(`${ADMIN_API_PREFIX}/coupons`, { method: 'POST', body: newCoupon });
    toast.success(`Kupon oluşturuldu: ${newCoupon.code.toUpperCase()}`);
    setNewCoupon({ ...newCoupon, code: '' });
    onRefresh();
  }

  async function savePromoConfig() {
    await apiRequest(`${ADMIN_API_PREFIX}/config`, { method: 'PATCH', body: promoForm });
    toast.success('Invite & Flash İndirim ayarları güncellendi!');
    onRefresh();
  }

  async function rewardLeader(uid, displayName) {
    await apiRequest(`${ADMIN_API_PREFIX}/leaderboard/reward`, {
      method: 'POST',
      body: { uid, bonusBalance: 50, badge: 'Liderlik Şampiyonu' },
    });
    toast.success(`${displayName} +50 İnvite ve Şampiyon rozeti ile ödüllendirildi!`);
    onRefresh();
  }

  const topInviteCandidates = (users && users.length > 0
    ? [...users]
        .filter((u) => !u.banned)
        .sort((a, b) => Number(b.referralCount || 0) - Number(a.referralCount || 0))
        .slice(0, 6)
        .map((u, idx) => ({ ...u, rank: idx + 1 }))
    : (leaderboard?.byInvites || []).slice(0, 6));

  return (
    <div className="space-y-8">
      {/* 1. Packages Management */}
      <div className="glass-panel rounded-3xl p-6 space-y-5">
        <h3 className="font-display text-xl font-bold text-white">Paket Ekleme, Fiyat Ayarlama &amp; Duraklatma</h3>
        <form onSubmit={createPackage} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs">
          <select value={newPkg.category} onChange={(e) => setNewPkg({ ...newPkg, category: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
            <option value="minecraft">Minecraft</option>
            <option value="web">Website</option>
            <option value="discord">Discord Bot</option>
            <option value="altyapi">Altyapı</option>
          </select>
          <input required value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} placeholder="Paket Adı" className="col-span-2 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newPkg.priceDaily} onChange={(e) => setNewPkg({ ...newPkg, priceDaily: Number(e.target.value) })} placeholder="Günlük İnvite" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newPkg.priceWeekly} onChange={(e) => setNewPkg({ ...newPkg, priceWeekly: Number(e.target.value) })} placeholder="Haftalık İnvite" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newPkg.priceMonthly} onChange={(e) => setNewPkg({ ...newPkg, priceMonthly: Number(e.target.value) })} placeholder="Aylık İnvite" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newPkg.ramMb} onChange={(e) => setNewPkg({ ...newPkg, ramMb: Number(e.target.value) })} placeholder="RAM MB" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newPkg.diskMb} onChange={(e) => setNewPkg({ ...newPkg, diskMb: Number(e.target.value) })} placeholder="Disk MB" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input value={newPkg.description} onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })} placeholder="Açıklama" className="col-span-3 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <AnimatedButton type="submit" size="xs"><PlusIcon className="w-4 h-4" /> Paket Ekle</AnimatedButton>
        </form>

        <div className="space-y-2.5">
          {packages.map((p) => (
            <div key={p.id} className="p-4 rounded-2xl bg-zinc-950/60 border border-white/10 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="uppercase text-amber-300 font-mono">[{p.category}]</span> {p.name}
                  {p.paused && <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">DURAKLATILDI</span>}
                </div>
                <div className="text-zinc-400 font-mono mt-0.5">
                  Gün: {p.priceDaily} İnvite • Hafta: {p.priceWeekly} İnvite • Ay: {p.priceMonthly} İnvite • RAM: {p.ramMb}MB • Satış: {p.salesCount || 0}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AnimatedButton
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    const m = window.prompt(`${p.name} yeni Aylık fiyat (İnvite):`, p.priceMonthly);
                    if (m !== null && !Number.isNaN(Number(m))) {
                      const w = window.prompt('Yeni Haftalık fiyat (İnvite):', p.priceWeekly);
                      const d = window.prompt('Yeni Günlük fiyat (İnvite):', p.priceDaily);
                      updatePkg(p.id, {
                        priceMonthly: Number(m),
                        priceWeekly: Number(w ?? p.priceWeekly),
                        priceDaily: Number(d ?? p.priceDaily),
                      });
                    }
                  }}
                >
                  Fiyat Düzenle
                </AnimatedButton>
                <AnimatedButton size="xs" variant={p.paused ? 'emerald' : 'warning'} onClick={() => updatePkg(p.id, { paused: !p.paused })}>
                  {p.paused ? 'Satışı Aç' : 'Duraklat'}
                </AnimatedButton>
                <AnimatedButton size="xs" variant="ghost" onClick={() => updatePkg(p.id, { featured: !p.featured })}>
                  {p.featured ? 'Öne Çıkarma' : 'Öne Çıkar'}
                </AnimatedButton>
                <button onClick={() => deletePkg(p.id)} className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Coupons */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <CouponTagIcon className="w-5 h-5" />
          <h3 className="font-display text-xl font-bold text-white">İndirim Kuponu Sistemi</h3>
        </div>
        <form onSubmit={createCoupon} className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
          <input required value={newCoupon.code} onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })} placeholder="KOD (Örn: YILBASI30)" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
          <select value={newCoupon.discountType} onChange={(e) => setNewCoupon({ ...newCoupon, discountType: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
            <option value="percent">% Yüzde İndirim</option>
            <option value="fixed">Sabit İnvite İndirim</option>
          </select>
          <input type="number" value={newCoupon.value} onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })} placeholder="Değer" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" value={newCoupon.maxUses} onChange={(e) => setNewCoupon({ ...newCoupon, maxUses: Number(e.target.value) })} placeholder="Max Kullanım" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <select value={newCoupon.categoryFilter} onChange={(e) => setNewCoupon({ ...newCoupon, categoryFilter: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
            <option value="all">Tüm Kategoriler</option>
            <option value="minecraft">Minecraft</option>
            <option value="web">Website</option>
            <option value="discord">Discord Bot</option>
            <option value="altyapi">Altyapı</option>
          </select>
          <AnimatedButton type="submit" size="xs">Kupon Ekle</AnimatedButton>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {coupons.map((c) => (
            <div key={c.code} className="p-3.5 rounded-2xl bg-zinc-950/60 border border-white/10 flex items-center justify-between text-xs">
              <div>
                <div className="font-mono font-bold text-amber-300">{c.code}</div>
                <div className="text-zinc-400">
                  {c.discountType === 'percent' ? `%${c.value}` : `${c.value} İnvite`} • {c.usedCount}/{c.maxUses} kullanım • {c.categoryFilter}
                </div>
              </div>
              <div className="flex gap-1.5">
                <AnimatedButton
                  size="xs"
                  variant={c.active ? 'warning' : 'emerald'}
                  onClick={() => apiRequest(`${ADMIN_API_PREFIX}/coupons/${c.code}`, { method: 'PATCH', body: { active: !c.active } }).then(onRefresh)}
                >
                  {c.active ? 'Pasifle' : 'Aç'}
                </AnimatedButton>
                <button onClick={() => apiRequest(`${ADMIN_API_PREFIX}/coupons/${c.code}`, { method: 'DELETE' }).then(onRefresh)} className="text-rose-400 p-1">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Invite Promo, Flash Sale & Leaderboard Rewards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-3xl p-6 space-y-4 text-xs">
          <h3 className="font-display text-lg font-bold text-white">Invite Promosyonu &amp; Flash İndirim</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 block mb-1">Davet Eden Ödülü (İnvite)</label>
              <input type="number" value={promoForm.inviteRewardInviter} onChange={(e) => setPromoForm({ ...promoForm, inviteRewardInviter: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Davet Edilen Bonusu (İnvite)</label>
              <input type="number" value={promoForm.inviteRewardInvited} onChange={(e) => setPromoForm({ ...promoForm, inviteRewardInvited: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Site Geneli Flash İndirim (%)</label>
              <input type="number" min={0} max={90} value={promoForm.flashSalePercent} onChange={(e) => setPromoForm({ ...promoForm, flashSalePercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Gece Pazarı Kutu Sayısı (1-6)</label>
              <input type="number" min={1} max={6} value={promoForm.nightMarketBoxCount} onChange={(e) => setPromoForm({ ...promoForm, nightMarketBoxCount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 w-full">
              <input type="checkbox" checked={promoForm.invitePromoActive} onChange={(e) => setPromoForm({ ...promoForm, invitePromoActive: e.target.checked })} />
              <span>Invite Promosyonu Aktif</span>
            </label>
            <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 w-full">
              <input type="checkbox" checked={promoForm.nightMarketEnabled} onChange={(e) => setPromoForm({ ...promoForm, nightMarketEnabled: e.target.checked })} />
              <span>Gece Pazarı Aktif</span>
            </label>
          </div>
          <AnimatedButton size="sm" variant="emerald" onClick={savePromoConfig}>Promosyon &amp; Gece Pazarı Kaydet</AnimatedButton>
          <div className="text-zinc-400 pt-2">Toplam Gerçekleştirilen Davet: <strong className="text-amber-300">{invites.length}</strong></div>
        </div>

        <div className="glass-panel rounded-3xl p-6 space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <TrophyIcon className="w-5 h-5" />
            <h3 className="font-display text-lg font-bold text-white">Liderlik Tablosu Ödül Dağıtıcı</h3>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {topInviteCandidates.map((u) => (
              <div key={u.uid || u.rank} className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between gap-2">
                <span className="truncate">#{u.rank} <strong>{u.displayName}</strong> ({u.referralCount || 0} davet • {u.xp || 0} XP)</span>
                {u.uid && (
                  <AnimatedButton size="xs" variant="primary" onClick={() => rewardLeader(u.uid, u.displayName)}>
                    +50 İnvite Ödül Ver
                  </AnimatedButton>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Giveaways (Çekiliş Sistemi) Management */}
      <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
        <h3 className="font-display text-xl font-bold text-white">Çekiliş Sistemi Yönetimi</h3>
        <form onSubmit={createGiveaway} className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
          <input required value={newGiveaway.title} onChange={(e) => setNewGiveaway({ ...newGiveaway, title: e.target.value })} placeholder="Çekiliş Başlığı (örn: 500 İnvite Dev Çekiliş)" className="col-span-2 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <select value={newGiveaway.prizeType} onChange={(e) => setNewGiveaway({ ...newGiveaway, prizeType: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
            <option value="balance">Bakiye (İnvite)</option>
            <option value="coupon">İndirim Kuponu (%)</option>
          </select>
          <input type="number" value={newGiveaway.prizeValue} onChange={(e) => setNewGiveaway({ ...newGiveaway, prizeValue: Number(e.target.value) })} placeholder="Ödül Değeri" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <input type="number" min={1} value={newGiveaway.winnerCount} onChange={(e) => setNewGiveaway({ ...newGiveaway, winnerCount: Number(e.target.value) })} placeholder="Kazanan Sayısı" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          <AnimatedButton type="submit" size="xs">Çekiliş Başlat</AnimatedButton>
        </form>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {giveaways.map((g) => (
            <div key={g.id} className="p-4 rounded-2xl bg-zinc-950/60 border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">{g.title}</div>
                  <div className="text-zinc-400">
                    {g.prizeLabel} • {g.participantCount || 0} katılımcı • {g.status === 'active' ? 'Aktif' : 'Sonuçlandı'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {g.status === 'active' && (
                    <AnimatedButton size="xs" variant="primary" onClick={() => drawGiveaway(g.id)}>
                      Şimdi Çek
                    </AnimatedButton>
                  )}
                  <button
                    onClick={() => apiRequest(`${ADMIN_API_PREFIX}/giveaways/${g.id}`, { method: 'DELETE' }).then(() => setGiveaways((p) => p.filter((x) => x.id !== g.id)))}
                    className="text-rose-400 p-1"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {g.status === 'drawn' && Array.isArray(g.winners) && g.winners.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1">
                  <div className="text-[11px] font-semibold text-amber-300">Kazananlar (Bildirim İletildi):</div>
                  {g.winners.map((w, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px] bg-black/30 rounded-lg px-2.5 py-1.5">
                      <span className="text-white truncate">🏆 {w.displayName} ({w.email || w.uid})</span>
                      <span className="text-emerald-400 font-mono shrink-0 ml-2">{w.rewardNote}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
