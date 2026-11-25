import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { EmoLogo } from '../icons/EmoLogo';
import {
  WalletCoinIcon,
  ShieldAdminIcon,
  DiscordBrandIcon,
  LogoutIcon,
  BellIcon,
  MegaphoneIcon,
  WrenchMaintenanceIcon,
  SearchGlassIcon,
  TrophyIcon,
} from '../icons/EmoIcons';
import { AnimatedButton } from '../ui/AnimatedButton';
import { apiRequest, safeExternalUrl } from '../../lib/api';
import { ADMIN_ROUTE_PATH } from '../../lib/adminConfig';

export function Navbar({ onOpenCmd }) {
  const { user, firebaseUser, isAdmin, logout, bootstrap } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifSeenAt, setNotifSeenAt] = useState(() => Number(localStorage.getItem('emoc_notif_seen_at') || 0));
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const unreadCount = notifications.filter((n) => Number(n.createdAt || 0) > notifSeenAt).length;

  function markNotificationsRead() {
    const now = Date.now();
    setNotifSeenAt(now);
    localStorage.setItem('emoc_notif_seen_at', String(now));
  }

  const cfg = bootstrap?.config || {};

  useEffect(() => {
    if (firebaseUser) {
      apiRequest('/api/auth/notifications')
        .then((d) => setNotifications(d.notifications || []))
        .catch(() => {});
    }
  }, [firebaseUser, location.pathname]);

  useEffect(() => {
    const onNotif = (e) => {
      const n = e.detail;
      if (!n) return;
      setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 30));
    };
    window.addEventListener('emoc:notification', onNotif);
    return () => window.removeEventListener('emoc:notification', onNotif);
  }, []);

  useEffect(() => {
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        setNotifOpen(false);
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const navItems = [
    { to: '/servers', label: 'Hizmetlerim', auth: true },
    { to: '/packages', label: 'Mağaza', badge: cfg.flashSalePercent > 0 ? `%${cfg.flashSalePercent}` : null },
    { to: '/deals', label: 'Fırsatlar', dot: cfg.nightMarketEnabled !== false },
    { to: '/giveaways', label: 'Çekilişler' },
    { to: '/sss', label: 'SSS' },
    { to: '/tickets', label: 'Destek', auth: true },
  ];

  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to));

  return (
    <header className="sticky top-0 z-50">
      {cfg.maintenanceMode && isAdmin && (
        <div className="bg-amber-500/15 border-b border-amber-500/25 px-4 py-1 text-center text-xs font-medium text-amber-200 flex items-center justify-center gap-2 backdrop-blur-md">
          <WrenchMaintenanceIcon className="w-3.5 h-3.5" />
          <span>Bakım Modu Aktif — Kurucu yönetici olarak erişiyorsunuz.</span>
        </div>
      )}

      {cfg.announcementActive && cfg.announcementBanner && (
        <div className="bg-zinc-900/95 border-b border-white/[0.06] px-4 py-1.5 text-center text-xs font-medium text-zinc-200 flex items-center justify-center gap-2">
          <MegaphoneIcon className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="truncate">{cfg.announcementBanner}</span>
          {cfg.flashSalePercent > 0 && (!cfg.flashSaleEndsAt || Date.now() < cfg.flashSaleEndsAt) && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/35 text-amber-300 text-[11px] font-bold shrink-0">
              %{cfg.flashSalePercent} FLASH
            </span>
          )}
        </div>
      )}

      {/* Sleek Single-Line Floating-Style Obsidian Navbar (Screenshot 1 & 2 Inspired) */}
      <div className="px-3 sm:px-5 pt-2.5 pb-1">
        <nav className="max-w-[1440px] mx-auto rounded-2xl border border-white/[0.08] bg-[#111216]/90 backdrop-blur-xl shadow-[0_12px_36px_-12px_rgba(0,0,0,0.85)] px-3.5 sm:px-5 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6 min-w-0">
            <Link to="/" className="shrink-0">
              <EmoLogo size={32} />
            </Link>

            <div className="hidden lg:flex items-center gap-1">
              {navItems
                .filter((item) => !item.auth || firebaseUser)
                .map((item) => {
                  const active = isActive(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`relative px-3 py-1.5 rounded-xl text-[13px] font-medium transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                        active ? 'text-white bg-white/[0.07]' : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span>{item.label}</span>
                      {item.dot && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenCmd && (
              <button
                type="button"
                onClick={onOpenCmd}
                title="Hızlı Arama (Ctrl+K)"
                aria-label="Hızlı Arama (Ctrl+K)"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-400 hover:text-zinc-100 text-xs transition"
              >
                <SearchGlassIcon className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden xl:inline text-[11px] font-mono">Ctrl+K</span>
              </button>
            )}

            {firebaseUser ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate('/leaderboard')}
                  title="Bakiye & Davet"
                  aria-label="Bakiye ve davet sayfasına git"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/[0.08] hover:border-amber-500/35 text-xs font-semibold text-zinc-200 transition whitespace-nowrap"
                >
                  <WalletCoinIcon className="w-3.5 h-3.5 text-amber-400" />
                  <span>{Number(user?.balance || 0).toFixed(2)} İnvite</span>
                </button>

                {/* Notifications */}
                <div className="relative" ref={notifRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setNotifOpen((v) => !v);
                    }}
                    aria-expanded={notifOpen}
                    aria-haspopup="dialog"
                    className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 hover:text-white relative transition"
                    aria-label="Bildirimler"
                  >
                    <BellIcon className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-zinc-950 text-[10px] font-extrabold flex items-center justify-center">
                        {Math.min(9, unreadCount)}
                      </span>
                    )}
                  </button>

                  <AnimatePresence>
                    {notifOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl glass-panel p-3 z-50"
                      >
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.08]">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                            Bildirimler {unreadCount > 0 ? `(${unreadCount})` : ''}
                          </span>
                          <div className="flex items-center gap-3">
                            {notifications.length > 0 && (
                              <button onClick={markNotificationsRead} className="text-[11px] text-emerald-400 hover:text-emerald-300">
                                Okundu İşaretle
                              </button>
                            )}
                            <button onClick={() => setNotifOpen(false)} className="text-xs text-zinc-400 hover:text-white">
                              Kapat
                            </button>
                          </div>
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-2 pr-0.5">
                          {notifications.length === 0 ? (
                            <p className="text-xs text-zinc-500 py-6 text-center">Henüz bildiriminiz yok.</p>
                          ) : (
                            notifications.map((n) => {
                              const isUnread = Number(n.createdAt || 0) > notifSeenAt;
                              const tag =
                                n.type === 'giveaway_win' || n.type === 'giveaway_new'
                                  ? { text: 'Çekiliş', cls: 'bg-amber-500/15 text-amber-300' }
                                  : n.type === 'wallet'
                                  ? { text: 'Bakiye', cls: 'bg-emerald-500/15 text-emerald-300' }
                                  : n.type === 'server_power'
                                  ? { text: 'Sunucu', cls: 'bg-sky-500/15 text-sky-300' }
                                  : n.type === 'changelog'
                                  ? { text: 'Sürüm', cls: 'bg-orange-500/15 text-orange-300' }
                                  : { text: 'Bilgi', cls: 'bg-zinc-800 text-zinc-300' };
                              return (
                                <div
                                  key={n.id}
                                  className={`p-2.5 rounded-xl border text-xs transition ${
                                    isUnread
                                      ? 'bg-amber-500/[0.06] border-amber-500/25'
                                      : 'bg-white/[0.02] border-white/[0.06]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tag.cls}`}>{tag.text}</span>
                                    {n.createdAt && (
                                      <span className="text-[10px] font-mono text-zinc-500">
                                        {new Date(n.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-semibold text-white">{n.title}</div>
                                  <div className="text-zinc-400 mt-0.5 leading-relaxed">{n.message}</div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Direct Admin Shortcut when authorized */}
                {isAdmin && (
                  <Link
                    to={ADMIN_ROUTE_PATH}
                    className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-xs font-bold text-rose-300 transition whitespace-nowrap"
                    title="Yönetici Komuta Merkezi"
                  >
                    <ShieldAdminIcon className="w-3.5 h-3.5" />
                    <span>Admin</span>
                  </Link>
                )}

                {/* User Pill Dropdown */}
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    aria-expanded={userMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Kullanıcı menüsü"
                    onClick={() => setUserMenuOpen((v) => !v)}
                    className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-xs font-medium text-zinc-100 transition whitespace-nowrap"
                  >
                    <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 text-zinc-950 font-extrabold flex items-center justify-center text-[11px]">
                      {(user?.displayName || firebaseUser.email || 'E')[0].toUpperCase()}
                    </span>
                    <span className="hidden md:inline max-w-[110px] truncate">{user?.displayName || 'Hesabım'}</span>
                    <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>

                  <AnimatePresence>
                    {userMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        className="absolute right-0 mt-2 w-60 rounded-2xl glass-panel p-2 z-50 space-y-1"
                      >
                        <div className="px-3 py-2 border-b border-white/[0.08] mb-1">
                          <div className="text-xs font-bold text-white truncate">{user?.displayName}</div>
                          <div className="text-[11px] text-zinc-400 truncate">{firebaseUser.email}</div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px]">
                            <span className="text-amber-400 font-semibold">{Number(user?.balance || 0).toFixed(2)} İnvite</span>
                            <span className="text-zinc-500">{user?.xp || 0} XP</span>
                          </div>
                        </div>

                        <Link
                          to="/account"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          Hesap Ayarları
                        </Link>
                        <Link
                          to="/servers"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          Sunucularım
                        </Link>
                        <Link
                          to="/deals"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center justify-between px-3 py-2 rounded-xl text-xs text-amber-300 hover:bg-amber-500/10"
                        >
                          <span>Gece Pazarı (Fırsatlar)</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        </Link>
                        <Link
                          to="/giveaways"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          Çekilişler
                        </Link>
                        <Link
                          to="/leaderboard"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          <TrophyIcon className="w-3.5 h-3.5 text-amber-400" />
                          <span>Davet &amp; Liderlik</span>
                        </Link>
                        <Link
                          to="/status"
                          onClick={() => setUserMenuOpen(false)}
                          className="block px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                        >
                          Sistem Durumu
                        </Link>
                        {bootstrap?.latestChangelog && (
                          <button
                            type="button"
                            onClick={() => {
                              setUserMenuOpen(false);
                              window.dispatchEvent(new Event('emoc:open-changelog'));
                            }}
                            className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl text-xs text-zinc-200 hover:bg-white/[0.06]"
                          >
                            <span>Sürüm Notları</span>
                            <span className="font-mono text-[10px] text-amber-400">{bootstrap.latestChangelog.version}</span>
                          </button>
                        )}
                        {safeExternalUrl(cfg.discordInviteUrl) && (
                          <a
                            href={safeExternalUrl(cfg.discordInviteUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-indigo-300 hover:bg-indigo-500/10"
                          >
                            <DiscordBrandIcon className="w-3.5 h-3.5" />
                            <span>Discord Sunucusu</span>
                          </a>
                        )}

                        {isAdmin && (
                          <Link
                            to={ADMIN_ROUTE_PATH}
                            onClick={() => setUserMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 mt-1"
                          >
                            <ShieldAdminIcon className="w-3.5 h-3.5" />
                            <span>Admin Paneli</span>
                          </Link>
                        )}

                        <button
                          onClick={() => {
                            setUserMenuOpen(false);
                            logout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-rose-300 hover:bg-rose-500/10 mt-1"
                        >
                          <LogoutIcon className="w-3.5 h-3.5" />
                          <span>Çıkış Yap</span>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <AnimatedButton size="sm" variant="secondary" className="hidden sm:inline-flex" onClick={() => navigate('/auth')}>
                  Giriş Yap
                </AnimatedButton>
                <AnimatedButton size="sm" variant="primary" onClick={() => navigate('/auth?tab=register')}>
                  Ücretsiz Başla
                </AnimatedButton>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              className="lg:hidden p-2 rounded-xl bg-zinc-900 border border-white/[0.08] text-zinc-200"
              aria-label="Menüyü aç veya kapat"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="lg:hidden mx-3 rounded-2xl border border-white/[0.08] px-4 py-3 space-y-1 bg-[#111216]/98 backdrop-blur-xl overflow-hidden"
          >
            {navItems
              .filter((i) => !i.auth || firebaseUser)
              .map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={`block px-3 py-2 rounded-xl text-sm font-medium ${
                    isActive(item.to) ? 'bg-amber-500/15 text-amber-300' : 'text-zinc-300'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            {firebaseUser ? (
              <>
                <Link to="/account" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-xl text-sm text-zinc-300">
                  Hesap Ayarları
                </Link>
                {isAdmin && (
                  <Link
                    to={ADMIN_ROUTE_PATH}
                    onClick={() => setMobileOpen(false)}
                    className="block px-3 py-2 rounded-xl text-sm font-bold text-rose-300 bg-rose-500/10"
                  >
                    Admin Paneli
                  </Link>
                )}
              </>
            ) : (
              <Link to="/auth" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-xl text-sm text-amber-300 font-semibold">
                Giriş Yap / Kayıt Ol
              </Link>
            )}
            <Link to="/leaderboard" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-xl text-sm text-zinc-300">
              Davet &amp; Liderlik
            </Link>
            <Link to="/status" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-xl text-sm text-zinc-300">
              Sistem Durumu
            </Link>
            <Link to="/gizlilik-politikasi" onClick={() => setMobileOpen(false)} className="block px-3 py-2 rounded-xl text-sm text-zinc-400">
              Gizlilik &amp; KVKK
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
