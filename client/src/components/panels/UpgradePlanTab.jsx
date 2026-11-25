import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { apiRequest } from '../../lib/api';
import { AnimatedButton } from '../ui/AnimatedButton';

export function UpgradePlanTab({ server, onReload }) {
  const { bootstrap, user, refreshProfile } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState('');

  const packages = (bootstrap?.packages || []).filter(
    (p) => p.category === server.category && p.active !== false
  );

  async function switchPackage(pkg) {
    if (!window.confirm(`${server.name} paketini "${pkg.name}" olarak değiştirmek istediğinize emin misiniz?`)) return;
    setBusyId(pkg.id);
    try {
      const res = await apiRequest(`/api/store/change-package/${server.id}`, {
        method: 'POST',
        body: { newPackageId: pkg.id },
      });
      toast.success(
        res.netDelta >= 0
          ? `Paket yükseltildi! Fark: ${res.netDelta} İnvite düşüldü.`
          : `Paket düşürüldü! ${Math.abs(res.netDelta)} İnvite iade edildi.`
      );
      await Promise.all([refreshProfile(), onReload?.()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-white">Paket Yükseltme / Düşürme</h3>
          <p className="text-xs text-zinc-400">
            Mevcut paket: <strong className="text-amber-400">{server.packageName}</strong> • Kalan sürenize göre fark anlık hesaplanır.
          </p>
        </div>
        <div className="text-xs font-mono text-zinc-300 bg-[#09090b] px-3 py-1.5 rounded-xl border border-white/[0.08]">
          Bakiye: <strong className="text-amber-400">{Number(user?.balance || 0).toFixed(2)} İnvite</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {packages.map((pkg) => {
          const isCurrent = pkg.id === server.packageId;
          const isUpgrade = Number(pkg.ramMb || 0) >= Number(server.allocatedRamMb || 0);
          return (
            <div
              key={pkg.id}
              className={`glass-panel rounded-2xl p-5 flex flex-col justify-between gap-4 ${
                isCurrent ? 'border-amber-500/45' : ''
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-display font-bold text-white">{pkg.name}</h4>
                  {isCurrent && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">Mevcut</span>
                  )}
                </div>
                <div className="font-display text-2xl font-black text-white">
                  {pkg.priceMonthly} İnvite <span className="text-xs text-zinc-400 font-normal">/ ay</span>
                </div>
                <ul className="text-xs text-zinc-400 space-y-1 pt-2 border-t border-white/[0.06]">
                  <li>• {pkg.ramMb} MB RAM</li>
                  <li>• {pkg.cpuCores} vCPU ({pkg.cpuLimitPct}%)</li>
                  <li>• {Math.round((pkg.diskMb || 0) / 1024)} GB NVMe Disk</li>
                  <li>• {pkg.backupsLimit} Yedek Slotu</li>
                </ul>
              </div>
              <AnimatedButton
                size="sm"
                variant={isCurrent ? 'ghost' : isUpgrade ? 'primary' : 'secondary'}
                disabled={isCurrent || pkg.paused}
                loading={busyId === pkg.id}
                onClick={() => switchPackage(pkg)}
                className="w-full"
              >
                {isCurrent ? 'Aktif Paket' : isUpgrade ? 'Paketi Yükselt' : 'Paketi Düşür'}
              </AnimatedButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}
