import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { ADMIN_ROUTE_PATH } from '../../lib/adminConfig';
import { SearchGlassIcon, CategoryIcon, ShieldAdminIcon, ArrowRightIcon } from '../icons/EmoIcons';

export function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [servers, setServers] = useState([]);
  const navigate = useNavigate();
  const { firebaseUser, isAdmin } = useAuth();

  useEffect(() => {
    if (open && firebaseUser) {
      apiRequest('/api/servers').then((d) => setServers(d.servers || [])).catch(() => {});
    }
  }, [open, firebaseUser]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const actions = [
    { label: 'Ana Sayfa', to: '/', cat: 'Sayfa' },
    { label: 'Mağaza & Paketler', to: '/packages', cat: 'Sayfa' },
    { label: 'Gece Pazarı (Fırsatlar)', to: '/deals', cat: 'Fırsat' },
    { label: 'Çekilişler', to: '/giveaways', cat: 'Etkinlik' },
    { label: 'Sıkça Sorulan Sorular (SSS)', to: '/sss', cat: 'Yardım' },
    { label: 'Hizmetlerim / Sunucularım', to: '/servers', cat: 'Panel', auth: true },
    { label: 'Destek Talepleri', to: '/tickets', cat: 'Destek', auth: true },
    { label: 'Davet & Liderlik Tablosu', to: '/leaderboard', cat: 'Topluluk' },
    { label: 'Canlı Sistem Durumu', to: '/status', cat: 'Durum' },
    { label: 'Gizlilik Politikası & KVKK', to: '/gizlilik-politikasi', cat: 'Yasal' },
    { label: 'Hizmet Kullanım Şartları', to: '/kullanim-sartlari', cat: 'Yasal' },
    ...(isAdmin ? [{ label: 'Süper Admin Paneli', to: ADMIN_ROUTE_PATH, cat: 'Admin', isAdmin: true }] : []),
    ...servers.map((s) => ({
      label: `${s.name} (${s.domainAddress || s.slug + '.emochost.com'})`,
      to: `/servers/${s.id}`,
      cat: 'Sunucu',
      serverCategory: s.category,
    })),
  ].filter((a) => (!a.auth || firebaseUser) && a.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Hızlı arama"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.97, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.97, y: -10 }}
            onClick={(e) => e.stopPropagation()}
            className="glass-panel max-w-lg w-full rounded-2xl overflow-hidden border border-white/10"
          >
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/[0.08]">
              <label htmlFor="cmd-palette-search" className="sr-only">
                Sayfa veya sunucu ara
              </label>
              <SearchGlassIcon className="w-4 h-4 text-amber-400" />
              <input
                id="cmd-palette-search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sayfa veya sunucu ara... (ESC)"
                className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-500"
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Aramayı kapat"
                className="text-[11px] px-2 py-0.5 rounded bg-white/[0.08] text-zinc-300"
              >
                ESC
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {actions.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">Sonuç bulunamadı.</div>
              ) : (
                actions.map((a) => (
                  <button
                    key={a.to + a.label}
                    type="button"
                    onClick={() => {
                      navigate(a.to);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl hover:bg-amber-500/10 text-left transition group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {a.serverCategory ? (
                        <CategoryIcon category={a.serverCategory} className="w-4 h-4 shrink-0" />
                      ) : a.isAdmin ? (
                        <ShieldAdminIcon className="w-4 h-4 shrink-0" />
                      ) : (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                      <span className="text-sm font-medium text-white group-hover:text-amber-300 truncate">{a.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 shrink-0">
                      <span>{a.cat}</span>
                      <ArrowRightIcon className="w-3.5 h-3.5 opacity-60" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
