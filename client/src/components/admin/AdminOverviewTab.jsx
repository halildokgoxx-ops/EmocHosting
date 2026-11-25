import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { CpuChipIcon, RamStickIcon, DiskDriveIcon, ShieldAdminIcon } from '../icons/EmoIcons';

export function AdminOverviewTab({ overview }) {
  const telemetry = overview?.telemetry || {};
  const host = telemetry.host || {};
  const totals = telemetry.totals || {};
  const alerts = telemetry.alerts || [];
  const history = telemetry.history || [];
  const summary = overview?.summary || {};

  return (
    <div className="space-y-6 tabular-nums">
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-5 border-amber-500/25">
          <div className="text-xs text-zinc-400">Toplam / Açık Sunucu</div>
          <div className="font-display text-3xl font-black text-white mt-1">
            {totals.totalServers || 0}{' '}
            <span className="text-lg text-emerald-400">/ {totals.runningServers || 0} Açık</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Duraklatılan: {totals.pausedServers || 0} • Kapalı: {totals.stoppedServers || 0}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Süre Dağılımı (Gün / Hafta / Ay)</div>
          <div className="font-display text-2xl font-black text-white mt-1">
            <span className="text-amber-300">{totals.dailyServers || 0}G</span> •{' '}
            <span className="text-zinc-200">{totals.weeklyServers || 0}H</span> •{' '}
            <span className="text-emerald-400">{totals.monthlyServers || 0}A</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            MC: {totals.byCategory?.minecraft || 0} • Web: {totals.byCategory?.web || 0} • Bot: {totals.byCategory?.discord || 0} • Alt: {totals.byCategory?.altyapi || 0}
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Tüm Sunucular TOPLAM Tüketim</div>
          <div className="font-display text-2xl font-black text-emerald-400 mt-1">
            CPU %{totals.totalCpuPct || 0} • {Math.round(totals.totalUsedRamMb || 0)} MB
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Tahsis: {totals.totalAllocatedRamMb || 0} MB RAM • Disk: {(totals.totalDiskUsedMb || 0).toFixed(1)} MB
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <div className="text-xs text-zinc-400">Üyeler, Bakiye &amp; Destek</div>
          <div className="font-display text-2xl font-black text-white mt-1">
            {summary.totalUsers || 0} Üye <span className="text-sm text-rose-400">({summary.bannedUsers || 0} Ban)</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            Cüzdan Toplamı: {summary.totalUserBalance || 0} İnvite • Açık Talep: {summary.openTickets || 0}
          </div>
        </div>
      </div>

      {/* Host Hardware Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-4">
          <CpuChipIcon className="w-8 h-8 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-xs text-zinc-400">Ana Makine CPU ({host.cpuCores || 0} Çekirdek)</div>
            <div className="font-display text-2xl font-extrabold text-white">%{host.cpuLoadPct || 0}</div>
            <div className="text-[11px] text-zinc-500 truncate">{host.cpuModel}</div>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-4">
          <RamStickIcon className="w-8 h-8 text-emerald-400 shrink-0" />
          <div>
            <div className="text-xs text-zinc-400">Fiziksel RAM (Host OS)</div>
            <div className="font-display text-2xl font-extrabold text-white">%{host.ramUsedPct || 0}</div>
            <div className="text-[11px] text-zinc-500">
              {host.usedRamMb || 0} MB / {host.totalRamMb || 0} MB
            </div>
          </div>
        </div>
        <div className="glass-panel rounded-2xl p-5 flex items-center gap-4">
          <DiskDriveIcon className="w-8 h-8 text-orange-400 shrink-0" />
          <div>
            <div className="text-xs text-zinc-400">Host Disk &amp; Uptime</div>
            <div className="font-display text-2xl font-extrabold text-white">
              {host.diskUsedGb || 0} / {host.diskTotalGb || 0} GB (%{host.diskUsedPct || 0})
            </div>
            <div className="text-[11px] text-zinc-500">Çalışma: {Math.floor((host.uptimeSec || 0) / 3600)} saat</div>
          </div>
        </div>
      </div>

      {/* Real-time Telemetry Chart */}
      <div className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-lg font-bold text-white">Gerçek Zamanlı CPU &amp; Sunucu Yük Grafiği</h3>
            <p className="text-xs text-zinc-400">Her 3 saniyede bir gerçek OS ve PID verisinden güncellenir</p>
          </div>
          <span className="text-xs font-mono text-amber-300">Ciro: {summary.totalPlatformRevenue || 0} İnvite • Yetkili: {summary.adminCount || 1}</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="cpuG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="srvG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="time" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} />
              <Tooltip contentStyle={{ background: '#111216', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12 }} />
              <Area type="monotone" dataKey="hostCpu" name="Host CPU %" stroke="#f59e0b" fill="url(#cpuG)" />
              <Area type="monotone" dataKey="serversCpu" name="Sunucular CPU %" stroke="#10b981" fill="url(#srvG)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* High Resource Threshold Alerts */}
      {alerts.length > 0 && (
        <div className="glass-panel rounded-2xl p-5 border-rose-500/40 space-y-2">
          <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
            <ShieldAdminIcon className="w-5 h-5" />
            <span>Yüksek Kaynak Kullanım Alarmları ({alerts.length})</span>
          </div>
          {alerts.map((a) => (
            <div key={a.serverId} className="text-xs bg-rose-500/10 border border-rose-400/20 px-3 py-2 rounded-xl flex justify-between">
              <span><strong>{a.serverName}</strong> ({a.ownerEmail})</span>
              <span className="text-rose-300 font-bold">{a.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
