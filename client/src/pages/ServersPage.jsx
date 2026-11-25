import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { auth } from '../lib/firebase';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import {
  CategoryIcon,
  PowerPlayIcon,
  PowerStopIcon,
  PowerPauseIcon,
  RestartIcon,
  PlusIcon,
  ClockScheduleIcon,
  ArrowRightIcon,
  CopyIcon,
} from '../components/icons/EmoIcons';

export function ServersPage() {
  const { firebaseUser, refreshProfile } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [renewTarget, setRenewTarget] = useState(null);
  const [renewCycle, setRenewCycle] = useState('monthly');
  const [actionBusy, setActionBusy] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  useEffect(() => {
    if (!renewTarget) return;
    const onKey = (e) => {
      if (e.key === 'Escape') setRenewTarget(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [renewTarget]);

  const loadServers = useCallback(async (silent = false) => {
    try {
      const data = await apiRequest('/api/servers');
      setServers(data.servers || []);
    } catch (err) {
      if (!silent) toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // StrictMode-safe Socket.IO subscription (prevents duplicate listeners)
  useEffect(() => {
    if (!firebaseUser) return;
    loadServers();
    let socket = null;
    let disposed = false;

    auth.currentUser?.getIdToken().then((token) => {
      if (disposed || !token) return;
      socket = io('/', { auth: { token } });
      socket.on('telemetry:server', (stat) => {
        setServers((prev) =>
          prev.map((s) => (s.id === stat.serverId ? { ...s, status: stat.status, live: stat } : s))
        );
      });
      socket.on('server:status', ({ serverId, status }) => {
        setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, status } : s)));
      });
    });

    const timer = setInterval(() => loadServers(true), 12000);
    return () => {
      disposed = true;
      clearInterval(timer);
      socket?.disconnect();
    };
  }, [firebaseUser, loadServers]);

  async function powerAction(serverId, action) {
    setActionBusy((p) => ({ ...p, [serverId]: action }));
    try {
      await apiRequest(`/api/servers/${serverId}/power`, { method: 'POST', body: { action } });
      toast.success(`Sunucu komutu uygulandı: ${action.toUpperCase()}`);
      await loadServers();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setActionBusy((p) => ({ ...p, [serverId]: null }));
    }
  }

  async function handleRenew(e) {
    e.preventDefault();
    if (!renewTarget) return;
    try {
      await apiRequest(`/api/store/renew/${renewTarget.id}`, {
        method: 'POST',
        body: { billingCycle: renewCycle },
      });
      toast.success('Sunucu süresi başarıyla uzatıldı!');
      setRenewTarget(null);
      await Promise.all([loadServers(), refreshProfile()]);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const statusBadge = (st) => {
    if (st === 'running') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    if (st === 'paused') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
    if (st === 'suspended') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
    return 'bg-zinc-800 text-zinc-400 border-white/10';
  };

  const statusLabel = (st) =>
    st === 'running' ? 'Aktif' : st === 'paused' ? 'Uyuyor / Duraklatıldı' : st === 'suspended' ? 'Askıda' : 'Kapalı';

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <SeoHead title="Hizmetlerim & Sunucularım" noIndex />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-[0.2em] text-amber-400">Canlı Süreç Yönetimi</span>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-white">Hizmetlerim</h1>
        </div>
        <AnimatedButton variant="primary" onClick={() => navigate('/packages')}>
          <PlusIcon className="w-4 h-4" />
          <span>Yeni Sunucu Oluştur</span>
        </AnimatedButton>
      </div>

      {!loading && servers.length > 0 && (
        <div className="space-y-4">
          {/* Quick Resource Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
            <div className="glass-panel rounded-2xl p-4">
              <div className="text-[11px] text-zinc-400">Toplam Sunucu</div>
              <div className="font-display text-xl font-black text-white mt-0.5">
                {servers.length}{' '}
                <span className="text-xs font-mono text-emerald-400">
                  ({servers.filter((s) => (s.live?.status || s.status) === 'running').length} Aktif)
                </span>
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="text-[11px] text-zinc-400">Tahsisli RAM</div>
              <div className="font-display text-xl font-black text-amber-300 mt-0.5">
                {(servers.reduce((a, s) => a + Number(s.allocatedRamMb || 0), 0) / 1024).toFixed(1)} GB
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="text-[11px] text-zinc-400">NVMe Disk Kotası</div>
              <div className="font-display text-xl font-black text-white mt-0.5">
                {Math.round(servers.reduce((a, s) => a + Number(s.allocatedDiskMb || 0), 0) / 1024)} GB
              </div>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <div className="text-[11px] text-zinc-400">Paylaşılan Erişim</div>
              <div className="font-display text-xl font-black text-zinc-200 mt-0.5">
                {servers.filter((s) => s.isShared).length} Yetki
              </div>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
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
                  onClick={() => setCatFilter(c.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                    catFilter === c.id
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-zinc-900 border-white/[0.08] text-zinc-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <label htmlFor="servers-search-input" className="sr-only">Sunucu veya domain ara</label>
            <input
              id="servers-search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Sunucu veya domain ara..."
              className="px-3.5 py-2 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white sm:w-64 outline-none focus:border-amber-500/50"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[1, 2].map((i) => (
            <div key={i} className="glass-panel rounded-2xl h-56 animate-pulse" />
          ))}
        </div>
      ) : servers.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4">
          <h3 className="font-display text-2xl font-bold text-white">Henüz bir sunucunuz yok</h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Minecraft, Website, Discord Bot veya Altyapı paketlerinden birini seçerek otomatik <code className="text-amber-400">.emochost.com</code> alan adıyla kurulum başlatın.
          </p>
          <AnimatedButton onClick={() => navigate('/packages')}>Mağazaya Git</AnimatedButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {servers
            .filter((srv) => {
              if (catFilter !== 'all' && srv.category !== catFilter) return false;
              const q = searchTerm.trim().toLowerCase();
              if (!q) return true;
              const addr = `${srv.name} ${srv.domainAddress || ''} ${srv.slug || ''}`.toLowerCase();
              return addr.includes(q);
            })
            .map((srv) => {
            const live = srv.live || {};
            const st = live.status || srv.status;
            const ramPct = Math.min(100, Number(live.ramPct || 0));
            const diskPct = Math.min(100, srv.allocatedDiskMb ? ((live.diskUsedMb || 0) / srv.allocatedDiskMb) * 100 : 0);
            const daysLeft = srv.expiresAt ? Math.max(0, Math.ceil((srv.expiresAt - Date.now()) / 86400000)) : 0;
            const domainAddr = srv.domainAddress || `${srv.subdomain || srv.slug}.emochost.com`;

            return (
              <motion.div
                key={srv.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel glass-card-hover rounded-2xl p-5 sm:p-6 space-y-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center shrink-0">
                      <CategoryIcon category={srv.category} className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display text-lg font-bold text-white truncate">{srv.name}</h3>
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge(st)}`}>
                          {statusLabel(st)}
                        </span>
                        {srv.isShared && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200">
                            PAYLAŞILAN
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(domainAddr);
                          toast.success(`Adres kopyalandı: ${domainAddr}`);
                        }}
                        className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono text-amber-400 hover:text-amber-300"
                      >
                        <span>{domainAddr}</span>
                        <CopyIcon className="w-3 h-3 opacity-75" />
                      </button>
                      <div className="text-[11px] text-zinc-500 font-mono">
                        {srv.packageName} • Port: {srv.port}
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setRenewTarget(srv)}
                    className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 transition shrink-0"
                  >
                    <ClockScheduleIcon className="w-3.5 h-3.5 text-amber-400" />
                    <span>{daysLeft} gün</span>
                  </button>
                </div>

                {/* Resource Bars */}
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="flex justify-between text-zinc-500">
                      <span>CPU</span>
                      <span className="text-zinc-200 font-mono">{live.cpuPct || 0}%</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.08] rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, live.cpuPct || 0)}%` }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="flex justify-between text-zinc-500">
                      <span>RAM</span>
                      <span className="text-zinc-200 font-mono">{Math.round(live.ramUsedMb || 0)}/{srv.allocatedRamMb}M</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.08] rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-emerald-400 transition-all" style={{ width: `${ramPct}%` }} />
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="flex justify-between text-zinc-500">
                      <span>Disk</span>
                      <span className="text-zinc-200 font-mono">{(live.diskUsedMb || 0).toFixed(1)}M</span>
                    </div>
                    <div className="h-1.5 bg-white/[0.08] rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-orange-400 transition-all" style={{ width: `${diskPct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-white/[0.07]">
                  <div className="flex items-center gap-1.5">
                    <AnimatedButton
                      size="xs"
                      variant="emerald"
                      disabled={st === 'running' || st === 'suspended'}
                      loading={actionBusy[srv.id] === 'start'}
                      onClick={() => powerAction(srv.id, 'start')}
                    >
                      <PowerPlayIcon className="w-3.5 h-3.5" />
                      <span>Başlat</span>
                    </AnimatedButton>
                    <AnimatedButton
                      size="xs"
                      variant="warning"
                      title="Duraklat"
                      aria-label={`${srv.name} sunucusunu duraklat`}
                      disabled={st !== 'running'}
                      loading={actionBusy[srv.id] === 'pause'}
                      onClick={() => powerAction(srv.id, 'pause')}
                    >
                      <PowerPauseIcon className="w-3.5 h-3.5" />
                    </AnimatedButton>
                    <AnimatedButton
                      size="xs"
                      variant="danger"
                      title="Durdur"
                      aria-label={`${srv.name} sunucusunu durdur`}
                      disabled={st === 'stopped'}
                      loading={actionBusy[srv.id] === 'stop'}
                      onClick={() => powerAction(srv.id, 'stop')}
                    >
                      <PowerStopIcon className="w-3.5 h-3.5" />
                    </AnimatedButton>
                    <AnimatedButton
                      size="xs"
                      variant="secondary"
                      title="Yeniden Başlat"
                      aria-label={`${srv.name} sunucusunu yeniden başlat`}
                      disabled={st === 'suspended'}
                      loading={actionBusy[srv.id] === 'restart'}
                      onClick={() => powerAction(srv.id, 'restart')}
                    >
                      <RestartIcon className="w-3.5 h-3.5" />
                    </AnimatedButton>
                  </div>

                  <AnimatedButton size="sm" variant="primary" onClick={() => navigate(`/servers/${srv.id}`)}>
                    <span>Yönetim Paneli</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </AnimatedButton>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {renewTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="renew-modal-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setRenewTarget(null)}
        >
          <form onSubmit={handleRenew} onClick={(e) => e.stopPropagation()} className="glass-panel max-w-md w-full rounded-2xl p-6 space-y-4">
            <h3 id="renew-modal-title" className="font-display text-xl font-bold text-white">Süre Uzat — {renewTarget.name}</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'daily', label: '+1 Gün' },
                { id: 'weekly', label: '+7 Gün' },
                { id: 'monthly', label: '+30 Gün' },
              ].map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setRenewCycle(c.id)}
                  className={`py-2.5 rounded-xl text-xs font-bold border ${
                    renewCycle === c.id ? 'bg-amber-500 text-zinc-950 border-amber-400' : 'bg-zinc-900 text-zinc-300 border-white/10'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <AnimatedButton type="button" variant="ghost" onClick={() => setRenewTarget(null)}>İptal</AnimatedButton>
              <AnimatedButton type="submit" variant="primary">Bakiyeden Uzat</AnimatedButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
