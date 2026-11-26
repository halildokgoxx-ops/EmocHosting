import React, { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { ADMIN_API_PREFIX } from '../lib/adminConfig';
import { auth } from '../lib/firebase';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { AdminOverviewTab } from '../components/admin/AdminOverviewTab';
import { AdminServersTab } from '../components/admin/AdminServersTab';
import { AdminUsersTab } from '../components/admin/AdminUsersTab';
import { AdminPackagesTab } from '../components/admin/AdminPackagesTab';
import { AdminCouponsTab } from '../components/admin/AdminCouponsTab';
import { AdminGiveawaysTab } from '../components/admin/AdminGiveawaysTab';
import { AdminTicketsTab } from '../components/admin/AdminTicketsTab';
import { AdminChangelogTab } from '../components/admin/AdminChangelogTab';
import { AdminSettingsTab } from '../components/admin/AdminSettingsTab';
import { AdminSystemToolsTab } from '../components/admin/AdminSystemToolsTab';
import { AdminAnalyticsTab } from '../components/admin/AdminAnalyticsTab';
import {
  ShieldAdminIcon,
  CategoryIcon,
  ConsoleTerminalIcon,
  PlayersGroupIcon,
  CouponTagIcon,
  TrophyIcon,
  TicketSupportIcon,
  PluginSparkIcon,
  SettingsGearIcon,
  ChartPulseIcon,
  WrenchMaintenanceIcon,
} from '../components/icons/EmoIcons';

export function AdminPage() {
  const { firebaseUser, isAdmin, isOwner, bootstrap, refreshBootstrap } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [servers, setServers] = useState([]);
  const [totals, setTotals] = useState({});
  const [packages, setPackages] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [invites, setInvites] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [config, setConfig] = useState({});

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [ov, usr, srv, pkg, cpn, inv, tkt, cfg] = await Promise.all([
        apiRequest(`${ADMIN_API_PREFIX}/overview`),
        apiRequest(`${ADMIN_API_PREFIX}/users`),
        apiRequest(`${ADMIN_API_PREFIX}/servers`),
        apiRequest(`${ADMIN_API_PREFIX}/packages`),
        apiRequest(`${ADMIN_API_PREFIX}/coupons`),
        apiRequest(`${ADMIN_API_PREFIX}/invites`),
        apiRequest(`${ADMIN_API_PREFIX}/tickets`),
        apiRequest(`${ADMIN_API_PREFIX}/config`),
      ]);
      setOverview(ov);
      setUsers(usr.users || []);
      setServers(srv.servers || []);
      setTotals(srv.totals || {});
      setPackages(pkg.packages || []);
      setCoupons(cpn.coupons || []);
      setInvites(inv.invites || []);
      setTickets(tkt.tickets || []);
      setConfig(cfg.config || {});
      refreshBootstrap();
    } catch (err) {
      toast.error(err.message);
    }
  }, [isAdmin, refreshBootstrap, toast]);

  useEffect(() => {
    loadAll();
    if (!isAdmin) return;
    let socket = null;
    let disposed = false;
    auth.currentUser?.getIdToken().then((token) => {
      if (disposed || !token) return;
      socket = io('/', { auth: { token } });
      socket.on('telemetry:admin', (tel) => {
        setOverview((prev) => (prev ? { ...prev, telemetry: tel } : { telemetry: tel, summary: {} }));
        setTotals(tel.totals || {});
        setServers((prev) =>
          prev.map((s) => ({
            ...s,
            status: tel.perServer?.[s.id]?.status || s.status,
            live: tel.perServer?.[s.id] || s.live,
          }))
        );
      });
    });
    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [isAdmin, loadAll]);

  if (!firebaseUser || !isAdmin) {
    return (
      <div className="relative z-10 max-w-xl mx-auto px-6 py-24 text-center">
        <SeoHead title="Admin Erişimi" noIndex />
        <div className="glass-panel rounded-3xl p-8 space-y-4 border-rose-500/40">
          <ShieldAdminIcon className="w-12 h-12 mx-auto text-rose-400" />
          <h1 className="font-display text-2xl font-black text-rose-300">Erişim Reddedildi</h1>
          <p className="text-sm text-zinc-300">
            Bu yönetim alanına yalnızca yetkili platform yöneticileri erişebilir.
          </p>
        </div>
      </div>
    );
  }

  const openTicketsCount = tickets.filter((t) => t.status !== 'closed').length;

  const menuGroups = [
    {
      title: 'GENEL',
      items: [
        { id: 'overview', label: 'Komuta Merkezi', icon: CategoryIcon },
        { id: 'analytics', label: 'Çerez & İlgi Analitiği', icon: ChartPulseIcon },
        { id: 'servers', label: `Sunucular (${servers.length})`, icon: ConsoleTerminalIcon },
      ],
    },
    {
      title: 'ÜYELER & DESTEK',
      items: [
        { id: 'users', label: `Kullanıcılar (${users.length})`, icon: PlayersGroupIcon },
        { id: 'tickets', label: `Destek Masası (${openTicketsCount})`, icon: TicketSupportIcon },
      ],
    },
    {
      title: 'MAĞAZA & ETKİNLİK',
      items: [
        { id: 'packages', label: `Paketler (${packages.length})`, icon: CategoryIcon },
        { id: 'coupons', label: `Kuponlar (${coupons.length})`, icon: CouponTagIcon },
        { id: 'giveaways', label: 'Çekilişler & Davet', icon: TrophyIcon },
      ],
    },
    {
      title: 'YAYIN & AYARLAR',
      items: [
        { id: 'changelog', label: 'Güncelleme Notları', icon: PluginSparkIcon },
        { id: 'settings', label: 'Platform Ayarları', icon: SettingsGearIcon },
        { id: 'tools', label: 'Sistem & Güvenlik', icon: WrenchMaintenanceIcon },
      ],
    },
  ];

  const SidebarContent = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
        {!sidebarCollapsed && (
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-amber-400 font-semibold">
            ADMİN MENÜ
          </span>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-zinc-900 border border-white/[0.08] items-center justify-center text-zinc-400 hover:text-white"
          title="Menüyü Daralt/Genişlet"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {menuGroups.map((grp) => (
          <div key={grp.title} className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-2.5 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                {grp.title}
              </div>
            )}
            {grp.items.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-[13px] font-medium transition text-left ${
                    active
                      ? 'bg-gradient-to-r from-amber-500/20 to-rose-500/[0.08] border border-amber-500/35 text-amber-200'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : ''}`} />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="p-2.5 border-t border-white/[0.07]">
        <button
          type="button"
          onClick={loadAll}
          className="w-full px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-semibold text-amber-300 transition truncate"
        >
          {sidebarCollapsed ? '↻' : 'Tüm Verileri Yenile'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative z-10 max-w-[1440px] mx-auto px-3 sm:px-5 py-4 sm:py-6">
      <SeoHead title="Süper Admin Paneli" noIndex />

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Desktop Vertical Sidebar */}
        <aside
          className={`hidden lg:block shrink-0 sticky top-20 h-[calc(100vh-6rem)] rounded-2xl bg-[#111216]/95 border border-white/[0.08] overflow-hidden transition-all duration-200 ${
            sidebarCollapsed ? 'w-[68px]' : 'w-[252px]'
          }`}
        >
          {SidebarContent}
        </aside>

        {/* Mobile Menu Trigger Bar */}
        <div className="lg:hidden w-full flex items-center justify-between gap-2">
          <AnimatedButton size="sm" variant="secondary" onClick={() => setMobileMenuOpen((v) => !v)}>
            ☰ Admin Menüsü
          </AnimatedButton>
          <span className="text-xs font-mono text-amber-400 truncate max-w-[180px]">{firebaseUser.email}</span>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden w-full rounded-2xl bg-[#111216] border border-white/[0.08] overflow-hidden">
            {SidebarContent}
          </div>
        )}

        {/* Right Content Column */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          <div className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 border-amber-500/25">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center shrink-0">
                <ShieldAdminIcon className="w-6 h-6 text-rose-400" />
              </div>
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-black text-white">EmoçHosting Süper Admin</h1>
                <p className="text-xs text-zinc-400">
                  Yetkili: <span className="text-amber-300 font-mono">{firebaseUser.email}</span> •{' '}
                  {isOwner ? 'Kurucu Yetkisi (Tam Erişim)' : 'Yönetici Yetkisi'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/10 text-zinc-300">
                {servers.length} Sunucu
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/10 text-zinc-300">
                {users.length} Üye
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/10 text-amber-300">
                {openTicketsCount} Açık Talep
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {tab === 'overview' && <AdminOverviewTab overview={overview} />}
              {tab === 'analytics' && <AdminAnalyticsTab />}
              {tab === 'servers' && <AdminServersTab servers={servers} totals={totals} isOwner={isOwner} onRefresh={loadAll} />}
              {tab === 'users' && <AdminUsersTab users={users} isOwner={isOwner} onRefresh={loadAll} />}
              {tab === 'packages' && <AdminPackagesTab packages={packages} onRefresh={loadAll} />}
              {tab === 'coupons' && <AdminCouponsTab coupons={coupons} config={config} onRefresh={loadAll} />}
              {tab === 'giveaways' && (
                <AdminGiveawaysTab
                  invites={invites}
                  users={users}
                  config={config}
                  leaderboard={bootstrap?.leaderboard}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'tickets' && <AdminTicketsTab tickets={tickets} onRefresh={loadAll} />}
              {tab === 'changelog' && <AdminChangelogTab onRefresh={loadAll} />}
              {tab === 'settings' && <AdminSettingsTab config={config} isOwner={isOwner} onRefresh={loadAll} />}
              {tab === 'tools' && <AdminSystemToolsTab onRefresh={loadAll} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
