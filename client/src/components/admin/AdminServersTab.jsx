import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import {
  PowerPlayIcon,
  PowerStopIcon,
  PowerPauseIcon,
  RestartIcon,
  TrashIcon,
  CategoryIcon,
} from '../icons/EmoIcons';

export function AdminServersTab({ servers, totals, isOwner, onRefresh }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [cycleFilter, setCycleFilter] = useState('all');
  const [editingSrv, setEditingSrv] = useState(null);
  const [resForm, setResForm] = useState({});
  const [transferTarget, setTransferTarget] = useState('');

  const filtered = servers.filter((s) => {
    const matchText =
      !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.ownerEmail?.toLowerCase().includes(search.toLowerCase()) ||
      s.category?.toLowerCase().includes(search.toLowerCase());
    const matchCycle = cycleFilter === 'all' || s.billingCycle === cycleFilter;
    return matchText && matchCycle;
  });

  async function power(id, action) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/servers/${id}/power`, { method: 'POST', body: { action } });
      toast.success(`Sunucu eylemi uygulandı: ${action}`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function bulk(action) {
    if (action === 'panic_stop' && !window.confirm('TÜM çalışan sunucular acil olarak durdurulsun mu?')) return;
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/servers/bulk`, { method: 'POST', body: { action } });
      toast.success(`Toplu işlem tamamlandı (${res.affected} sunucu etkilendi)`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveResources(e) {
    e.preventDefault();
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/servers/${editingSrv.id}/resources`, { method: 'PATCH', body: resForm });
      toast.success('Sunucu kaynak limitleri güncellendi!');
      setEditingSrv(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function extendDays(id, days) {
    await apiRequest(`${ADMIN_API_PREFIX}/servers/${id}/extend`, { method: 'POST', body: { days } });
    toast.success(`+${days} gün eklendi`);
    onRefresh();
  }

  async function transferServer(id) {
    if (!transferTarget.trim()) return;
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/servers/${id}/transfer`, { method: 'POST', body: { targetEmail: transferTarget } });
      toast.success('Sunucu sahibi değiştirildi!');
      setTransferTarget('');
      setEditingSrv(null);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteSrv(id, name) {
    if (!window.confirm(`"${name}" sunucusu ve tüm dosyaları kalıcı olarak silinsin mi?`)) return;
    await apiRequest(`${ADMIN_API_PREFIX}/servers/${id}`, { method: 'DELETE' });
    toast.info('Sunucu silindi');
    onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Total Consumption & Bulk Controls */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs space-y-1">
          <div className="font-bold text-white text-sm">Toplam Tüketim Özeti</div>
          <div className="text-zinc-300 font-mono">
            CPU: <strong className="text-amber-300">%{totals?.totalCpuPct || 0}</strong> • RAM:{' '}
            <strong className="text-zinc-200">{Math.round(totals?.totalUsedRamMb || 0)} / {totals?.totalAllocatedRamMb || 0} MB</strong> • Disk:{' '}
            <strong className="text-emerald-300">{(totals?.totalDiskUsedMb || 0).toFixed(1)} MB</strong>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <AnimatedButton size="xs" variant="warning" onClick={() => bulk('pause_all')}>Tümünü Duraklat</AnimatedButton>
          <AnimatedButton size="xs" variant="secondary" onClick={() => bulk('stop_expired')}>Süresi Dolanları Askıya Al</AnimatedButton>
          <AnimatedButton size="xs" variant="danger" onClick={() => bulk('stop_all')}>Tümünü Kapat</AnimatedButton>
          {isOwner && (
            <AnimatedButton size="xs" variant="danger" onClick={() => bulk('panic_stop')}>
              ACİL PANIC STOP
            </AnimatedButton>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sunucu adı, sahip e-posta veya kategori ara..."
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
        />
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
          {[
            { id: 'all', label: 'Tümü' },
            { id: 'daily', label: 'Günlük' },
            { id: 'weekly', label: 'Haftalık' },
            { id: 'monthly', label: 'Aylık' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setCycleFilter(c.id)}
              className={`px-3 py-1 rounded-lg font-bold ${cycleFilter === c.id ? 'bg-amber-500 text-zinc-950' : 'text-zinc-300'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile Cards (< md) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.map((s) => {
          const live = s.live || {};
          const st = live.status || s.status;
          return (
            <div key={s.id} className="glass-panel rounded-2xl p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CategoryIcon category={s.category} className="w-5 h-5 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{s.name}</div>
                    <div className="text-[10px] text-zinc-400 font-mono truncate">{s.ownerEmail}</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-white/10 font-bold text-[10px] shrink-0">{st.toUpperCase()}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px] bg-zinc-950/60 p-2.5 rounded-xl">
                <div>CPU: <span className="text-amber-300">%{live.cpuPct || 0}</span></div>
                <div>RAM: <span className="text-zinc-200">{Math.round(live.ramUsedMb || 0)}M</span></div>
                <div>Disk: <span className="text-emerald-300">{(live.diskUsedMb || 0).toFixed(0)}M</span></div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <AnimatedButton size="xs" variant="emerald" onClick={() => power(s.id, 'start')}>Aç</AnimatedButton>
                <AnimatedButton size="xs" variant="warning" onClick={() => power(s.id, 'pause')}>Duraklat</AnimatedButton>
                <AnimatedButton size="xs" variant="danger" onClick={() => power(s.id, 'stop')}>Durdur</AnimatedButton>
                <AnimatedButton
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setEditingSrv(s);
                    setResForm({
                      allocatedRamMb: s.allocatedRamMb,
                      allocatedCpuPct: s.allocatedCpuPct,
                      allocatedDiskMb: s.allocatedDiskMb,
                      slotsOrPorts: s.slotsOrPorts,
                      backupsLimit: s.backupsLimit,
                    });
                  }}
                >
                  Kaynak
                </AnimatedButton>
                <AnimatedButton size="xs" variant="ghost" onClick={() => navigate(`/servers/${s.id}`)}>Panel</AnimatedButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual Per-Server Table (Desktop >= md) */}
      <div className="hidden md:block glass-panel rounded-3xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-white/10 text-zinc-400 uppercase">
            <tr>
              <th className="p-4">Sunucu</th>
              <th className="p-4">Sahip</th>
              <th className="p-4">Dönem / Port</th>
              <th className="p-4">Durum / PID</th>
              <th className="p-4">Tekil Kaynak Tüketimi</th>
              <th className="p-4 text-right">Kontrol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.map((s) => {
              const live = s.live || {};
              const st = live.status || s.status;
              return (
                <tr key={s.id} className="hover:bg-white/5">
                  <td className="p-4">
                    <div className="flex items-center gap-2.5">
                      <CategoryIcon category={s.category} className="w-5 h-5" />
                      <div>
                        <div className="font-bold text-white">{s.name}</div>
                        <div className="text-[10px] text-zinc-400 font-mono">{s.packageName}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-zinc-300 font-mono">{s.ownerEmail}</td>
                  <td className="p-4 font-mono">
                    <span className="text-amber-300">{s.billingCycle}</span> • :{s.port}
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        st === 'running'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : st === 'paused'
                          ? 'bg-amber-500/20 text-amber-300'
                          : st === 'suspended'
                          ? 'bg-rose-500/20 text-rose-300'
                          : 'bg-white/10 text-zinc-300'
                      }`}
                    >
                      {st.toUpperCase()} {live.pid ? `(${live.pid})` : ''}
                    </span>
                  </td>
                  <td className="p-4 font-mono space-y-0.5">
                    <div>CPU: <span className="text-amber-300">%{live.cpuPct || 0}</span> / {s.allocatedCpuPct}%</div>
                    <div>RAM: <span className="text-zinc-200">{Math.round(live.ramUsedMb || 0)}</span> / {s.allocatedRamMb} MB</div>
                    <div>Disk: <span className="text-emerald-300">{(live.diskUsedMb || 0).toFixed(1)}</span> / {s.allocatedDiskMb} MB</div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap">
                      <button onClick={() => power(s.id, 'start')} title="Başlat" className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/35">
                        <PowerPlayIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => power(s.id, 'pause')} title="Duraklat" className="p-1.5 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/35">
                        <PowerPauseIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => power(s.id, 'stop')} title="Durdur" className="p-1.5 rounded-lg bg-rose-500/20 text-rose-300 hover:bg-rose-500/35">
                        <PowerStopIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => power(s.id, 'restart')} title="Yeniden Başlat" className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20">
                        <RestartIcon className="w-3.5 h-3.5" />
                      </button>
                      <AnimatedButton
                        size="xs"
                        variant="secondary"
                        onClick={() => {
                          setEditingSrv(s);
                          setResForm({
                            allocatedRamMb: s.allocatedRamMb,
                            allocatedCpuPct: s.allocatedCpuPct,
                            allocatedDiskMb: s.allocatedDiskMb,
                            slotsOrPorts: s.slotsOrPorts,
                            backupsLimit: s.backupsLimit,
                          });
                        }}
                      >
                        Kaynak / Ayar
                      </AnimatedButton>
                      <AnimatedButton size="xs" variant="ghost" onClick={() => navigate(`/servers/${s.id}`)}>
                        Konsol
                      </AnimatedButton>
                      <button onClick={() => deleteSrv(s.id, s.name)} className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/20">
                        <TrashIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Resources / Extend / Transfer Modal */}
      {editingSrv && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setEditingSrv(null)}>
          <div className="glass-panel max-w-lg w-full rounded-3xl p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl font-bold text-white">Kaynak &amp; Yetki — {editingSrv.name}</h3>
            <form onSubmit={saveResources} className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">RAM Limiti (MB)</label>
                <input type="number" value={resForm.allocatedRamMb} onChange={(e) => setResForm({ ...resForm, allocatedRamMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">CPU Limiti (%)</label>
                <input type="number" value={resForm.allocatedCpuPct} onChange={(e) => setResForm({ ...resForm, allocatedCpuPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Disk Limiti (MB)</label>
                <input type="number" value={resForm.allocatedDiskMb} onChange={(e) => setResForm({ ...resForm, allocatedDiskMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Slot / Yedek</label>
                <div className="flex gap-2">
                  <input type="number" value={resForm.slotsOrPorts} onChange={(e) => setResForm({ ...resForm, slotsOrPorts: Number(e.target.value) })} className="w-1/2 px-2 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
                  <input type="number" value={resForm.backupsLimit} onChange={(e) => setResForm({ ...resForm, backupsLimit: Number(e.target.value) })} className="w-1/2 px-2 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
                </div>
              </div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <AnimatedButton type="submit" size="sm" variant="emerald">Kaynakları Uygula</AnimatedButton>
              </div>
            </form>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="text-xs font-bold text-zinc-300">Süre Uzat &amp; Askı Kontrolü</div>
              <div className="flex flex-wrap gap-2">
                <AnimatedButton size="xs" variant="secondary" onClick={() => extendDays(editingSrv.id, 1)}>+1 Gün</AnimatedButton>
                <AnimatedButton size="xs" variant="secondary" onClick={() => extendDays(editingSrv.id, 7)}>+7 Gün</AnimatedButton>
                <AnimatedButton size="xs" variant="secondary" onClick={() => extendDays(editingSrv.id, 30)}>+30 Gün</AnimatedButton>
                <AnimatedButton size="xs" variant="danger" onClick={() => power(editingSrv.id, editingSrv.status === 'suspended' ? 'unsuspend' : 'suspend')}>
                  {editingSrv.status === 'suspended' ? 'Askıyı Kaldır' : 'Askıya Al'}
                </AnimatedButton>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-2">
              <div className="text-xs font-bold text-zinc-300">Sunucuyu Başka Kullanıcıya Transfer Et</div>
              <div className="flex gap-2">
                <input
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  placeholder="Hedef kullanıcı e-postası"
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-xs text-white"
                />
                <AnimatedButton size="xs" onClick={() => transferServer(editingSrv.id)}>Transfer Et</AnimatedButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
