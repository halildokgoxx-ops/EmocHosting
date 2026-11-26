import React, { useState, useMemo } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon, PlusIcon, EditFileIcon, SearchGlassIcon } from '../icons/EmoIcons';

const DEFAULT_NEW_PKG = {
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
  sortOrder: 50,
  featured: false,
};

export function AdminPackagesTab({ packages = [], onRefresh }) {
  const toast = useToast();
  const { currencyLabel } = useAuth();
  const [newPkg, setNewPkg] = useState(DEFAULT_NEW_PKG);
  const [editing, setEditing] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [creating, setCreating] = useState(false);
  const [catFilter, setCatFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [bulkCat, setBulkCat] = useState('all');
  const [bulkPct, setBulkPct] = useState(10);
  const [applyingBulk, setApplyingBulk] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return packages.filter((p) => {
      if (catFilter !== 'all' && p.category !== catFilter) return false;
      if (!q) return true;
      return `${p.name} ${p.description || ''} ${p.badge || ''} ${p.category}`.toLowerCase().includes(q);
    });
  }, [packages, catFilter, search]);

  async function createPackage(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/packages`, { method: 'POST', body: newPkg });
      toast.success('Yeni paket mağazaya eklendi!');
      setNewPkg(DEFAULT_NEW_PKG);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function updatePkg(id, patch) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/packages/${id}`, { method: 'PATCH', body: patch });
      toast.success('Paket güncellendi');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveEditModal(e) {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/packages/${editing.id}`, {
        method: 'PATCH',
        body: {
          category: editing.category,
          name: editing.name,
          description: editing.description,
          badge: editing.badge || '',
          priceDaily: Number(editing.priceDaily),
          priceWeekly: Number(editing.priceWeekly),
          priceMonthly: Number(editing.priceMonthly),
          ramMb: Number(editing.ramMb),
          cpuCores: Number(editing.cpuCores),
          cpuLimitPct: Number(editing.cpuLimitPct),
          diskMb: Number(editing.diskMb),
          slotsOrPorts: Number(editing.slotsOrPorts || 10),
          backupsLimit: Number(editing.backupsLimit || 3),
          sortOrder: Number(editing.sortOrder || 50),
          featured: Boolean(editing.featured),
          paused: Boolean(editing.paused),
        },
      });
      toast.success(`"${editing.name}" paketi kaydedildi!`);
      setEditing(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function deletePkg(id, name) {
    if (!window.confirm(`"${name}" paketi kalıcı olarak silinsin mi?`)) return;
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/packages/${id}`, { method: 'DELETE' });
      toast.info('Paket silindi');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function applyBulkPrice(e) {
    e.preventDefault();
    const pct = Number(bulkPct);
    if (!Number.isFinite(pct) || pct === 0) {
      toast.warning('Geçerli bir yüzde oranı girin (örn: 15 veya -20)');
      return;
    }
    if (!window.confirm(`${bulkCat === 'all' ? 'Tüm kategorilerdeki' : bulkCat} paket fiyatlarına %${pct > 0 ? `+${pct}` : pct} değişim uygulansın mı?`)) {
      return;
    }
    setApplyingBulk(true);
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/packages/bulk-price`, {
        method: 'POST',
        body: { category: bulkCat, percentChange: pct },
      });
      toast.success(`${res.updatedCount} paketin fiyatları güncellendi!`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApplyingBulk(false);
    }
  }

  const totalSales = packages.reduce((acc, p) => acc + Number(p.salesCount || 0), 0);
  const pausedCount = packages.filter((p) => p.paused).length;
  const featuredCount = packages.filter((p) => p.featured).length;

  return (
    <div className="space-y-6 text-xs">
      {/* Quick Package Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM PAKET</div>
          <div className="font-display text-2xl font-black text-white mt-1">{packages.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">ÖNE ÇIKAN</div>
          <div className="font-display text-2xl font-black text-amber-400 mt-1">{featuredCount}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">DURAKLATILAN</div>
          <div className="font-display text-2xl font-black text-rose-400 mt-1">{pausedCount}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM SATIŞ</div>
          <div className="font-display text-2xl font-black text-emerald-400 mt-1">{totalSales}</div>
        </div>
      </div>

      {/* Create Package Form */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div>
          <h3 className="font-display text-xl font-bold text-white">Yeni Hosting Paketi Oluştur</h3>
          <p className="text-zinc-400 mt-0.5">Eklenen paket anında mağaza kataloğunda ve bootstrap önbelleğinde yayınlanır.</p>
        </div>
        <form onSubmit={createPackage} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Kategori</label>
            <select value={newPkg.category} onChange={(e) => setNewPkg({ ...newPkg, category: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="minecraft">Minecraft</option>
              <option value="web">Website</option>
              <option value="discord">Discord Bot</option>
              <option value="altyapi">Altyapı</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-zinc-400 block mb-1">Paket Adı</label>
            <input required value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} placeholder="Örn: MC Zümrüt VDS" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Günlük ({currencyLabel})</label>
            <input type="number" step="0.01" min={0} value={newPkg.priceDaily} onChange={(e) => setNewPkg({ ...newPkg, priceDaily: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Haftalık ({currencyLabel})</label>
            <input type="number" step="0.01" min={0} value={newPkg.priceWeekly} onChange={(e) => setNewPkg({ ...newPkg, priceWeekly: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Aylık ({currencyLabel})</label>
            <input type="number" step="0.01" min={0} value={newPkg.priceMonthly} onChange={(e) => setNewPkg({ ...newPkg, priceMonthly: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">RAM (MB)</label>
            <input type="number" min={128} value={newPkg.ramMb} onChange={(e) => setNewPkg({ ...newPkg, ramMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">CPU (Çekirdek / %)</label>
            <div className="flex gap-1">
              <input type="number" min={1} value={newPkg.cpuCores} onChange={(e) => setNewPkg({ ...newPkg, cpuCores: Number(e.target.value) })} className="w-1/2 px-2 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              <input type="number" min={25} value={newPkg.cpuLimitPct} onChange={(e) => setNewPkg({ ...newPkg, cpuLimitPct: Number(e.target.value) })} className="w-1/2 px-2 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Disk (MB)</label>
            <input type="number" min={256} value={newPkg.diskMb} onChange={(e) => setNewPkg({ ...newPkg, diskMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Rozet</label>
            <input value={newPkg.badge} onChange={(e) => setNewPkg({ ...newPkg, badge: e.target.value })} placeholder="Önerilen" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-zinc-400 block mb-1">Açıklama</label>
            <input value={newPkg.description} onChange={(e) => setNewPkg({ ...newPkg, description: e.target.value })} placeholder="Kısa paket açıklaması" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="col-span-2 sm:col-span-4 lg:col-span-6 flex flex-wrap items-center justify-between gap-3 pt-1">
            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input type="checkbox" checked={newPkg.featured} onChange={(e) => setNewPkg({ ...newPkg, featured: e.target.checked })} className="accent-amber-500" />
              <span>Ana sayfada öne çıkan olarak göster</span>
            </label>
            <AnimatedButton type="submit" size="sm" loading={creating}>
              <PlusIcon className="w-4 h-4" /> Paketi Yayınla
            </AnimatedButton>
          </div>
        </form>
      </div>

      {/* Bulk Price Adjuster */}
      <form onSubmit={applyBulkPrice} className="glass-panel rounded-3xl p-5 flex flex-wrap items-end justify-between gap-3 border-amber-500/20">
        <div>
          <h4 className="font-display text-base font-bold text-white">Toplu Paket Fiyatlandırma Aracı</h4>
          <p className="text-zinc-400 mt-0.5">Seçili kategorideki paketlerin günlük, haftalık ve aylık fiyatlarını yüzdesel olarak artırın veya azaltın. Birim: <strong className="text-amber-300">{currencyLabel}</strong></p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Kategori</label>
            <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="all">Tüm Paketler</option>
              <option value="minecraft">Minecraft</option>
              <option value="web">Website</option>
              <option value="discord">Discord Bot</option>
              <option value="altyapi">Altyapı</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Değişim (% Örn: +15 / -20)</label>
            <input type="number" step="0.5" min={-90} max={500} value={bulkPct} onChange={(e) => setBulkPct(Number(e.target.value))} className="w-32 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white font-mono" />
          </div>
          <AnimatedButton type="submit" size="sm" variant="warning" loading={applyingBulk}>
            Fiyatlara Uygula
          </AnimatedButton>
        </div>
      </form>

      {/* Filter & Package List */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'minecraft', label: 'Minecraft' },
              { id: 'web', label: 'Website' },
              { id: 'discord', label: 'Discord Bot' },
              { id: 'altyapi', label: 'Altyapı' },
            ].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCatFilter(c.id)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition ${
                  catFilter === c.id ? 'bg-amber-500/20 border-amber-500/45 text-amber-200' : 'bg-white/5 border-white/10 text-zinc-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-[210px]">
            <SearchGlassIcon className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Paket ara..."
              className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-950 border border-white/15 text-white"
            />
          </div>
        </div>

        <div className="space-y-2.5">
          {filtered.map((p) => (
            <div key={p.id} className="p-4 rounded-2xl bg-zinc-950/60 border border-white/10 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-bold text-white flex flex-wrap items-center gap-2">
                  <span className="uppercase text-amber-300 font-mono">[{p.category}]</span>
                  <span>{p.name}</span>
                  {p.badge && <span className="px-2 py-0.5 rounded-md bg-white/10 text-zinc-200 text-[10px]">{p.badge}</span>}
                  {p.featured && <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px]">ÖNE ÇIKAN</span>}
                  {p.paused && <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 text-[10px]">DURAKLATILDI</span>}
                </div>
                <div className="text-zinc-400 font-mono text-[11px]">
                  Gün: {p.priceDaily} • Hafta: {p.priceWeekly} • Ay: {p.priceMonthly} {currencyLabel} | {p.ramMb}MB RAM • {p.cpuCores} vCPU ({p.cpuLimitPct || 100}%) • {Math.round((p.diskMb || 0) / 1024)}GB NVMe | Sıra: #{p.sortOrder ?? 99} • Satış: {p.salesCount || 0}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AnimatedButton size="xs" variant="secondary" onClick={() => setEditing({ ...p })}>
                  <EditFileIcon className="w-3.5 h-3.5" /> Düzenle
                </AnimatedButton>
                <AnimatedButton size="xs" variant={p.paused ? 'emerald' : 'warning'} onClick={() => updatePkg(p.id, { paused: !p.paused })}>
                  {p.paused ? 'Satışı Aç' : 'Duraklat'}
                </AnimatedButton>
                <AnimatedButton size="xs" variant="ghost" onClick={() => updatePkg(p.id, { featured: !p.featured })}>
                  {p.featured ? 'Öne Çıkarma' : 'Öne Çıkar'}
                </AnimatedButton>
                <button type="button" onClick={() => deletePkg(p.id, p.name)} className="p-1.5 text-rose-400 hover:bg-rose-500/20 rounded-lg" title="Paketi Sil">
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full Package Editor Modal */}
      {editing && (
        <div className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <form
            onSubmit={saveEditModal}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-3xl bg-[#111216] border border-white/15 p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h4 className="font-display text-lg font-extrabold text-white">Paketi Düzenle: {editing.name}</h4>
              <button type="button" onClick={() => setEditing(null)} className="text-zinc-400 hover:text-white px-2">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">Kategori</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
                  <option value="minecraft">Minecraft</option>
                  <option value="web">Website</option>
                  <option value="discord">Discord Bot</option>
                  <option value="altyapi">Altyapı</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-zinc-400 block mb-1">Paket Adı</label>
                <input required value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Günlük ({currencyLabel})</label>
                <input type="number" step="0.01" min={0} value={editing.priceDaily ?? 0} onChange={(e) => setEditing({ ...editing, priceDaily: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Haftalık ({currencyLabel})</label>
                <input type="number" step="0.01" min={0} value={editing.priceWeekly ?? 0} onChange={(e) => setEditing({ ...editing, priceWeekly: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Aylık ({currencyLabel})</label>
                <input type="number" step="0.01" min={0} value={editing.priceMonthly ?? 0} onChange={(e) => setEditing({ ...editing, priceMonthly: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">RAM (MB)</label>
                <input type="number" min={128} value={editing.ramMb ?? 1024} onChange={(e) => setEditing({ ...editing, ramMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">CPU Çekirdek</label>
                <input type="number" min={1} value={editing.cpuCores ?? 1} onChange={(e) => setEditing({ ...editing, cpuCores: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">CPU Limiti (%)</label>
                <input type="number" min={25} value={editing.cpuLimitPct ?? 100} onChange={(e) => setEditing({ ...editing, cpuLimitPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Disk (MB)</label>
                <input type="number" min={256} value={editing.diskMb ?? 5120} onChange={(e) => setEditing({ ...editing, diskMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Slot / Port</label>
                <input type="number" min={1} value={editing.slotsOrPorts ?? 10} onChange={(e) => setEditing({ ...editing, slotsOrPorts: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Yedek Limiti</label>
                <input type="number" min={0} value={editing.backupsLimit ?? 3} onChange={(e) => setEditing({ ...editing, backupsLimit: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Rozet</label>
                <input value={editing.badge || ''} onChange={(e) => setEditing({ ...editing, badge: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Sıralama No</label>
                <input type="number" min={0} value={editing.sortOrder ?? 50} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="text-zinc-400 block mb-1">Açıklama</label>
                <textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
              <AnimatedButton type="button" variant="ghost" size="sm" onClick={() => setEditing(null)}>İptal</AnimatedButton>
              <AnimatedButton type="submit" variant="emerald" size="sm" loading={savingEdit}>Değişiklikleri Kaydet</AnimatedButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
