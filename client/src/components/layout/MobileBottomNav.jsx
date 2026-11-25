import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { ADMIN_ROUTE_PATH } from '../../lib/adminConfig';
import {
  AltyapiIcon,
  ConsoleTerminalIcon,
  PluginSparkIcon,
  TicketSupportIcon,
  ShieldAdminIcon,
  TrophyIcon,
} from '../icons/EmoIcons';

export function MobileBottomNav() {
  const { firebaseUser, isAdmin } = useAuth();
  const location = useLocation();

  const items = [
    { to: '/', label: 'Ana Sayfa', icon: PluginSparkIcon },
    { to: '/packages', label: 'Mağaza', icon: AltyapiIcon },
    ...(firebaseUser
      ? [
          { to: '/servers', label: 'Sunucular', icon: ConsoleTerminalIcon },
          { to: '/deals', label: 'Fırsatlar', icon: TrophyIcon },
        ]
      : [{ to: '/giveaways', label: 'Çekiliş', icon: TrophyIcon }]),
    ...(isAdmin
      ? [{ to: ADMIN_ROUTE_PATH, label: 'Admin', icon: ShieldAdminIcon }]
      : !firebaseUser
      ? [{ to: '/auth', label: 'Giriş', icon: ShieldAdminIcon }]
      : [{ to: '/account', label: 'Hesap', icon: ShieldAdminIcon }]),
  ];

  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <nav
      aria-label="Mobil alt gezinme menüsü"
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-white/[0.08] bg-[#111216]/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
    >
      <div className="grid grid-cols-5 gap-1 px-2 py-1.5">
        {items.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active = isActive(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl text-[10px] font-semibold transition ${
                active ? 'text-amber-300 bg-amber-500/15 border border-amber-500/25' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
