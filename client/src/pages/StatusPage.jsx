import React, { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { TelemetryChart } from '../components/ui/TelemetryChart';
import { ChartPulseIcon, CpuChipIcon, RamStickIcon } from '../components/icons/EmoIcons';

export function StatusPage() {
  const [status, setStatus] = useState(null);
  const [pingMs, setPingMs] = useState(null);
  const [pinging, setPinging] = useState(false);

  const measureLatency = useCallback(async () => {
    setPinging(true);
    const t0 = performance.now();
    try {
      await fetch('/api/health', { cache: 'no-store' });
      setPingMs(Math.max(1, Math.round(performance.now() - t0)));
    } catch {
      setPingMs(null);
    } finally {
      setPinging(false);
    }
  }, []);

  useEffect(() => {
    const load = () => apiRequest('/api/public/status').then(setStatus).catch(() => {});
    load();
    measureLatency();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [measureLatency]);

  const host = status?.host || {};
  const totals = status?.totals || {};
  const byCat = totals.byCategory || {};
  const incidents = status?.incidents || [];

  const nodes = [
    { key: 'minecraft', label: 'Minecraft Düğümü', count: byCat.minecraft || 0, color: 'bg-emerald-400' },
    { key: 'web', label: 'Website Host', count: byCat.web || 0, color: 'bg-amber-400' },
    { key: 'discord', label: 'Discord Bot', count: byCat.discord || 0, color: 'bg-indigo-400' },
    { key: 'altyapi', label: 'Altyapı Node', count: byCat.altyapi || 0, color: 'bg-orange-400' },
  ];

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <SeoHead
        title="Sistem Durumu & Altyapı Telemetrisi"
        description="EmoçHosting canlı ana makine CPU, RAM, gecikme süresi ve altyapı olay geçmişi."
      />

      <div className="glass-panel-luminous rounded-3xl p-6 sm:p-7 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center shrink-0">
            <ChartPulseIcon className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-black text-white">Canlı Sistem Durumu</h1>
            <p className="text-xs text-emerald-300 flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Tüm Sistemler Operasyonel • Gerçek Zamanlı Telemetri</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-xl bg-[#09090b] border border-white/[0.08] text-xs font-mono">
            <span className="text-zinc-500">Servis Yanıt Süresi: </span>
            <span className="text-amber-400 font-bold tabular-nums">
              {pingMs !== null ? `${pingMs} ms` : '...'}
            </span>
          </div>
          <AnimatedButton size="xs" variant="secondary" loading={pinging} onClick={measureLatency}>
            Ping Ölç
          </AnimatedButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
        <div className="glass-panel glass-card-hover rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <CpuChipIcon className="w-4 h-4 text-amber-400" />
            <span>Platform İşlemci Yükü</span>
          </div>
          <div className="font-display text-3xl font-black text-white">%{host.cpuLoadPct ?? 0}</div>
          <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
            <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, host.cpuLoadPct || 0)}%` }} />
          </div>
          <div className="text-[11px] text-zinc-500">Dengeli Kaynak Dağılımı</div>
        </div>

        <div className="glass-panel glass-card-hover rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <RamStickIcon className="w-4 h-4 text-emerald-400" />
            <span>Küme Bellek Durumu</span>
          </div>
          <div className="font-display text-3xl font-black text-white">%{host.ramUsedPct ?? 0}</div>
          <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 transition-all" style={{ width: `${Math.min(100, host.ramUsedPct || 0)}%` }} />
          </div>
          <div className="text-[11px] text-zinc-500">Otomatik Ölçekleme Aktif</div>
        </div>

        <div className="glass-panel glass-card-hover rounded-2xl p-5 space-y-2">
          <div className="text-xs text-zinc-400">Aktif / Toplam Sunucu</div>
          <div className="font-display text-3xl font-black text-emerald-400">
            {totals.runningServers ?? 0} <span className="text-base text-zinc-500">/ {totals.totalServers ?? 0}</span>
          </div>
          <div className="text-[11px] text-zinc-500">Aktif Barındırılan Hizmetler</div>
        </div>

        <div className="glass-panel glass-card-hover rounded-2xl p-5 space-y-2">
          <div className="text-xs text-zinc-400">Kesintisiz Çalışma</div>
          <div className="font-display text-3xl font-black text-amber-400">
            {Math.floor((host.uptimeSec || 0) / 3600)}sa {Math.floor(((host.uptimeSec || 0) % 3600) / 60)}dk
          </div>
          <div className="text-[11px] text-zinc-500">
            Güncelleme: {status?.updatedAt ? new Date(status.updatedAt).toLocaleTimeString('tr-TR') : '...'}
          </div>
        </div>
      </div>

      {/* Live Cluster Resource Trend Chart */}
      <div className="glass-panel rounded-2xl p-6">
        <TelemetryChart
          data={status?.history || []}
          title="Platform Anlık Yük & Kapasite Eğrisi"
          series={[
            { key: 'hostCpu', label: 'İşlemci Yükü', color: '#f59e0b', unit: '%' },
            { key: 'hostRamPct', label: 'Bellek Kullanımı', color: '#34d399', unit: '%' },
          ]}
        />
      </div>

      {/* Service Node Breakdown */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-white">Servis Dağılımı</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {nodes.map((n) => (
            <div key={n.key} className="p-4 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full ${n.color}`} />
                <span className="text-xs font-semibold text-zinc-200">{n.label}</span>
              </div>
              <span className="font-mono text-sm font-bold text-white tabular-nums">{n.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Incidents */}
      <div className="glass-panel rounded-3xl p-6 sm:p-7 space-y-4">
        <h2 className="font-display text-xl font-bold text-white">Altyapı Olayları &amp; Bakım Geçmişi</h2>
        {incidents.length === 0 ? (
          <div className="text-xs text-zinc-500 py-6 text-center">Aktif veya geçmiş bir kesinti kaydı bulunmuyor.</div>
        ) : (
          <div className="space-y-3">
            {incidents.map((inc) => (
              <div key={inc.id} className="p-4 rounded-2xl bg-[#09090b] border border-white/[0.07] space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-white text-sm">{inc.title}</h3>
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      inc.status === 'resolved' || inc.severity === 'operational'
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {inc.status === 'resolved' ? 'Çözüldü / Aktif' : inc.status}
                  </span>
                </div>
                <p className="text-xs text-zinc-300">{inc.message}</p>
                <div className="text-[10px] font-mono text-zinc-500">
                  {new Date(inc.createdAt).toLocaleString('tr-TR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
