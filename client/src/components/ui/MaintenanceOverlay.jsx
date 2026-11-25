import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { safeExternalUrl } from '../../lib/api';
import { WrenchMaintenanceIcon, DiscordBrandIcon } from '../icons/EmoIcons';
import { EmoLogo } from '../icons/EmoLogo';

export function MaintenanceOverlay() {
  const { bootstrap, isAdmin, firebaseUser } = useAuth();
  const cfg = bootstrap?.config;

  if (!cfg?.maintenanceMode || isAdmin) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-[#04060c]/95 backdrop-blur-2xl flex items-center justify-center p-6">
      <div className="glass-panel max-w-xl w-full rounded-3xl p-8 text-center space-y-6 border-amber-400/30">
        <div className="flex justify-center">
          <EmoLogo size={48} showText />
        </div>
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center">
          <WrenchMaintenanceIcon className="w-8 h-8" />
        </div>
        <h1 className="font-display text-3xl font-extrabold text-white">Planlı Sistem Bakımı</h1>
        <p className="text-slate-300 leading-relaxed">{cfg.maintenanceMessage}</p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          {safeExternalUrl(cfg.discordInviteUrl) && (
            <a
              href={safeExternalUrl(cfg.discordInviteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-400/35 text-indigo-200 font-semibold text-sm"
            >
              <DiscordBrandIcon className="w-5 h-5" />
              Discord Duyurularını Takip Et
            </a>
          )}
          {!firebaseUser && (
            <Link
              to="/auth"
              className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 text-sm hover:text-white"
            >
              Yönetici Girişi
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
