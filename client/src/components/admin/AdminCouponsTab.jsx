import React, { useState, useMemo, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { CouponTagIcon, TrashIcon, PlusIcon, CopyIcon, EditFileIcon, SearchGlassIcon } from '../icons/EmoIcons';

export function AdminCouponsTab({ coupons = [], config = {}, onRefresh }) {
  const toast = useToast();
  const { currencyLabel } = useAuth();
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discountType: 'percent',
    value: 20,
    minAmount: 0,
    maxUses: 100,
    expiresInDays: 30,
    categoryFilter: 'all',
  });

  const [campaign, setCampaign] = useState({
    flashSalePercent: config?.flashSalePercent ?? 0,
    flashSaleTitle: config?.flashSaleTitle || '',
    nightMarketEnabled: config?.nightMarketEnabled !== false,
    nightMarketCooldownDays: config?.nightMarketCooldownDays ?? 7,
    nightMarketBoxCount: config?.nightMarketBoxCount ?? 3,
  });

  useEffect(() => {
    setCampaign({
      flashSalePercent: config?.flashSalePercent ?? 0,
      flashSaleTitle: config?.flashSaleTitle || '',
      nightMarketEnabled: config?.nightMarketEnabled !== false,
      nightMarketCooldownDays: config?.nightMarketCooldownDays ?? 7,
      nightMarketBoxCount: config?.nightMarketBoxCount ?? 3,
    });
  }, [config]);

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = 'EMOC-';
    for (let i = 0; i < 6; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    setNewCoupon((p) => ({ ...p, code: out }));
  }

  async function createCoupon(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/coupons`, { method: 'POST', body: newCoupon });
      toast.success(`Kupon oluşturuldu: ${newCoupon.code.toUpperCase()}`);
      setNewCoupon({
        code: '',
        discountType: 'percent',
        value: 20,
        minAmount: 0,
        maxUses: 100,
        expiresInDays: 30,
        categoryFilter: 'all',
      });
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function saveCouponEdit(e) {
    e.preventDefault();
    if (!editing) return;
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/coupons/${editing.code}`, {
        method: 'PATCH',
        body: {
          discountType: editing.discountType,
          value: Number(editing.value),
          minAmount: Number(editing.minAmount || 0),
          maxUses: Number(editing.maxUses || 1),
          categoryFilter: editing.categoryFilter || 'all',
          active: Boolean(editing.active),
        },
      });
      toast.success(`${editing.code} kuponu güncellendi`);
      setEditing(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleCoupon(c) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/coupons/${c.code}`, { method: 'PATCH', body: { active: !c.active } });
      toast.success(`${c.code} ${!c.active ? 'aktifleştirildi' : 'pasifleştirildi'}`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteCoupon(code) {
    if (!window.confirm(`${code} kuponu silinsin mi?`)) return;
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/coupons/${code}`, { method: 'DELETE' });
      toast.info('Kupon silindi');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveCampaignSettings() {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/config`, { method: 'PATCH', body: campaign });
      toast.success('Flash İndirim ve Gece Pazarı ayarları kaydedildi!');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function resetAllNightMarkets() {
    if (!window.confirm('Tüm üyelerin Gece Pazarı kutuları sıfırlansın ve yeniden 3 kutu açılsın mı?')) return;
    try {
      const r = await apiRequest(`${ADMIN_API_PREFIX}/night-market/reset-all`, { method: 'POST' });
      toast.success(`${r.count} kullanıcının Gece Pazarı sıfırlandı!`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return coupons.filter((c) => {
      if (statusFilter === 'active' && !c.active) return false;
      if (statusFilter === 'inactive' && c.active) return false;
      if (!q) return true;
      return String(c.code || '').toUpperCase().includes(q) || String(c.categoryFilter || '').toUpperCase().includes(q);
    });
  }, [coupons, statusFilter, search]);

  const activeCount = coupons.filter((c) => c.active).length;
  const totalUses = coupons.reduce((acc, c) => acc + Number(c.usedCount || 0), 0);

  return (
    <div className="space-y-6 text-xs">
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM KUPON</div>
          <div className="font-display text-2xl font-black text-white mt-1">{coupons.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">AKTİF KUPON</div>
          <div className="font-display text-2xl font-black text-emerald-400 mt-1">{activeCount}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM KULLANIM</div>
          <div className="font-display text-2xl font-black text-amber-400 mt-1">{totalUses}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">FLASH İNDİRİM</div>
          <div className="font-display text-2xl font-black text-rose-400 mt-1">%{campaign.flashSalePercent || 0}</div>
        </div>
      </div>

      {/* Create Coupon */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <CouponTagIcon className="w-5 h-5 text-amber-400" />
            <h3 className="font-display text-xl font-bold text-white">Yeni İndirim Kuponu Oluştur</h3>
          </div>
          <AnimatedButton type="button" size="xs" variant="secondary" onClick={generateCode}>
            Rastgele Kod Üret
          </AnimatedButton>
        </div>

        <form onSubmit={createCoupon} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          <div className="col-span-2 sm:col-span-2">
            <label className="text-[10px] text-zinc-400 block mb-1">Kupon Kodu</label>
            <input
              required
              value={newCoupon.code}
              onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
              placeholder="YILBASI30"
              className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white"
            />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">İndirim Tipi</label>
            <select value={newCoupon.discountType} onChange={(e) => setNewCoupon({ ...newCoupon, discountType: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="percent">% Yüzde</option>
              <option value="fixed">Sabit {currencyLabel}</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Değer</label>
            <input type="number" min={1} value={newCoupon.value} onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Min Sepet</label>
            <input type="number" min={0} value={newCoupon.minAmount} onChange={(e) => setNewCoupon({ ...newCoupon, minAmount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Max Kullanım</label>
            <input type="number" min={1} value={newCoupon.maxUses} onChange={(e) => setNewCoupon({ ...newCoupon, maxUses: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Süre (Gün)</label>
            <input type="number" min={1} value={newCoupon.expiresInDays} onChange={(e) => setNewCoupon({ ...newCoupon, expiresInDays: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="col-span-2 sm:col-span-3">
            <label className="text-[10px] text-zinc-400 block mb-1">Kategori Kısıtlaması</label>
            <select value={newCoupon.categoryFilter} onChange={(e) => setNewCoupon({ ...newCoupon, categoryFilter: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="all">Tüm Kategoriler</option>
              <option value="minecraft">Sadece Minecraft</option>
              <option value="web">Sadece Website</option>
              <option value="discord">Sadece Discord Bot</option>
              <option value="altyapi">Sadece Altyapı</option>
            </select>
          </div>
          <div className="col-span-2 sm:col-span-4 flex items-end justify-end">
            <AnimatedButton type="submit" size="sm" loading={creating}>
              <PlusIcon className="w-4 h-4" /> Kupon Oluştur
            </AnimatedButton>
          </div>
        </form>
      </div>

      {/* Coupons List */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1.5">
            {[
              { id: 'all', label: `Tümü (${coupons.length})` },
              { id: 'active', label: `Aktif (${activeCount})` },
              { id: 'inactive', label: `Pasif (${coupons.length - activeCount})` },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                  statusFilter === f.id ? 'bg-amber-500/20 border-amber-500/45 text-amber-200' : 'bg-white/5 border-white/10 text-zinc-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[200px]">
            <SearchGlassIcon className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Kupon kodu ara..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-white/15 text-white font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <div key={c.code} className={`p-4 rounded-2xl border space-y-2.5 ${c.active ? 'bg-zinc-950/70 border-white/10' : 'bg-zinc-950/35 border-white/5 opacity-75'}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-extrabold text-sm text-amber-300">{c.code}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(c.code);
                        toast.info(`${c.code} kopyalandı`);
                      }}
                      className="text-zinc-400 hover:text-white"
                      title="Kodu Kopyala"
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-zinc-300 mt-1">
                    {c.discountType === 'percent' ? `%${c.value} İndirim` : `${c.value} ${currencyLabel} İndirim`} • Kategori: <span className="uppercase font-mono">{c.categoryFilter || 'all'}</span>
                  </div>
                  <div className="text-zinc-500 text-[11px] font-mono">
                    Kullanım: {c.usedCount || 0}/{c.maxUses} • Min: {c.minAmount || 0} {currencyLabel}
                    {c.expiresAt ? ` • Bitiş: ${new Date(c.expiresAt).toLocaleDateString('tr-TR')}` : ''}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${c.active ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-400'}`}>
                  {c.active ? 'AKTİF' : 'PASİF'}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-white/[0.07]">
                <AnimatedButton size="xs" variant="secondary" onClick={() => setEditing({ ...c })}>
                  <EditFileIcon className="w-3.5 h-3.5" /> Düzenle
                </AnimatedButton>
                <AnimatedButton size="xs" variant={c.active ? 'warning' : 'emerald'} onClick={() => toggleCoupon(c)}>
                  {c.active ? 'Pasifle' : 'Aktifle'}
                </AnimatedButton>
                <button type="button" onClick={() => deleteCoupon(c.code)} className="text-rose-400 hover:bg-rose-500/15 p-1.5 rounded-lg" title="Sil">
                  <TrashIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flash Sale & Night Market Controls */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Hızlı İndirim (Flash Sale) &amp; Gece Pazarı Kampanyaları</h3>
            <p className="text-zinc-400">Tüm mağaza paketlerine anlık indirim uygulayın veya haftalık Gece Pazarı kurallarını yönetin.</p>
          </div>
          <AnimatedButton size="xs" variant="warning" onClick={resetAllNightMarkets}>
            Tüm Gece Pazarlarını Sıfırla (3 Yeni Kutu)
          </AnimatedButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="text-zinc-400 block mb-1">Site Geneli Flash İndirim (%)</label>
            <input type="number" min={0} max={90} value={campaign.flashSalePercent} onChange={(e) => setCampaign({ ...campaign, flashSalePercent: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Flash İndirim Başlığı</label>
            <input value={campaign.flashSaleTitle} onChange={(e) => setCampaign({ ...campaign, flashSaleTitle: e.target.value })} placeholder="Örn: Hafta Sonu Fırsatı" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Gece Pazarı Kutu Sayısı (1-6)</label>
            <input type="number" min={1} max={6} value={campaign.nightMarketBoxCount} onChange={(e) => setCampaign({ ...campaign, nightMarketBoxCount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-zinc-400 block mb-1">Gece Pazarı Yenilenme (Gün)</label>
            <input type="number" min={1} max={90} value={campaign.nightMarketCooldownDays} onChange={(e) => setCampaign({ ...campaign, nightMarketCooldownDays: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <label className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 cursor-pointer">
            <input type="checkbox" checked={campaign.nightMarketEnabled} onChange={(e) => setCampaign({ ...campaign, nightMarketEnabled: e.target.checked })} className="accent-amber-500" />
            <span className="text-amber-200 font-semibold">Gece Pazarı Sistemi Aktif</span>
          </label>
          <AnimatedButton size="sm" variant="emerald" onClick={saveCampaignSettings}>Kampanya Ayarlarını Kaydet</AnimatedButton>
        </div>
      </div>

      {/* Edit Coupon Modal */}
      {editing && (
        <div className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form onSubmit={saveCouponEdit} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl bg-[#111216] border border-white/15 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="font-display text-lg font-extrabold text-white font-mono">Kupon Düzenle: {editing.code}</h4>
              <button type="button" onClick={() => setEditing(null)} className="text-zinc-400 hover:text-white px-2">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">İndirim Tipi</label>
                <select value={editing.discountType} onChange={(e) => setEditing({ ...editing, discountType: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
                  <option value="percent">% Yüzde</option>
                  <option value="fixed">Sabit {currencyLabel}</option>
                </select>
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Değer</label>
                <input type="number" min={1} value={editing.value} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Min Sepet</label>
                <input type="number" min={0} value={editing.minAmount ?? 0} onChange={(e) => setEditing({ ...editing, minAmount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Max Kullanım</label>
                <input type="number" min={1} value={editing.maxUses ?? 1} onChange={(e) => setEditing({ ...editing, maxUses: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div className="col-span-2">
                <label className="text-zinc-400 block mb-1">Kategori</label>
                <select value={editing.categoryFilter || 'all'} onChange={(e) => setEditing({ ...editing, categoryFilter: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
                  <option value="all">Tüm Kategoriler</option>
                  <option value="minecraft">Minecraft</option>
                  <option value="web">Website</option>
                  <option value="discord">Discord Bot</option>
                  <option value="altyapi">Altyapı</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <AnimatedButton type="button" variant="ghost" size="xs" onClick={() => setEditing(null)}>İptal</AnimatedButton>
              <AnimatedButton type="submit" variant="emerald" size="xs">Kaydet</AnimatedButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
