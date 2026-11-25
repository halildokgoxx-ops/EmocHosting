import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { AnimatedButton } from './AnimatedButton';
import { PluginSparkIcon } from '../icons/EmoIcons';

const CATEGORY_META = {
  feature: { label: 'Yeni Özellik', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  fix: { label: 'İyileştirme', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  security: { label: 'Güvenlik', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  maintenance: { label: 'Bakım', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
};

export function ChangelogModal() {
  const { bootstrap, user } = useAuth();
  const latest = bootstrap?.latestChangelog;
  const allLogs = bootstrap?.changelogs || [];

  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!latest?.id) return;
    if (user?.preferences?.changelogPopups === false) return;
    try {
      const dismissed = JSON.parse(localStorage.getItem('emoc_dismissed_changelogs') || '[]');
      if (!Array.isArray(dismissed) || !dismissed.includes(latest.id)) {
        setOpen(true);
      }
    } catch {
      setOpen(true);
    }
  }, [latest?.id]);

  useEffect(() => {
    const onManualOpen = () => {
      setShowHistory(allLogs.length > 1);
      setOpen(true);
    };
    window.addEventListener('emoc:open-changelog', onManualOpen);
    return () => window.removeEventListener('emoc:open-changelog', onManualOpen);
  }, [allLogs.length]);

  function handleClose() {
    if (dontShowAgain && latest?.id) {
      try {
        const dismissed = JSON.parse(localStorage.getItem('emoc_dismissed_changelogs') || '[]');
        const next = Array.isArray(dismissed) ? Array.from(new Set([...dismissed, latest.id])) : [latest.id];
        localStorage.setItem('emoc_dismissed_changelogs', JSON.stringify(next.slice(-30)));
      } catch {
        localStorage.setItem('emoc_dismissed_changelogs', JSON.stringify([latest.id]));
      }
    }
    setOpen(false);
  }

  const activeList = allLogs.length > 0 ? allLogs : latest ? [latest] : [];
  if (activeList.length === 0) return null;
  const shown = showHistory ? activeList : [activeList[0]];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[95] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl bg-[#111216] border border-white/[0.12] shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-5 border-b border-white/[0.08] bg-gradient-to-r from-amber-500/12 via-transparent to-transparent flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
                  <PluginSparkIcon className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <div className="text-[11px] font-mono uppercase tracking-wider text-amber-400">
                    Platform Güncelleme Notları
                  </div>
                  <h2 className="font-display text-lg font-extrabold text-white">
                    {shown[0]?.title}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="w-8 h-8 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center text-xs"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[60vh] overflow-y-auto">
              {shown.map((entry, idx) => {
                const cat = CATEGORY_META[entry.category] || CATEGORY_META.feature;
                return (
                  <div
                    key={entry.id || idx}
                    className={idx > 0 ? 'pt-5 border-t border-white/[0.08] space-y-3' : 'space-y-3'}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-zinc-900 border border-white/10 text-amber-300">
                          {entry.version || 'v1.0'}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cat.cls}`}>
                          {cat.label}
                        </span>
                        {idx > 0 && <span className="text-xs font-bold text-white">{entry.title}</span>}
                      </div>
                      {entry.createdAt && (
                        <span className="text-[10px] font-mono text-zinc-500">
                          {new Date(entry.createdAt).toLocaleDateString('tr-TR')}
                        </span>
                      )}
                    </div>

                    {entry.summary && (
                      <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">{entry.summary}</p>
                    )}

                    {Array.isArray(entry.items) && entry.items.length > 0 && (
                      <ul className="space-y-2">
                        {entry.items.map((line, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2.5 text-xs sm:text-sm text-zinc-300 bg-zinc-950/70 border border-white/[0.06] rounded-xl px-3.5 py-2.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}

              {allLogs.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowHistory((v) => !v)}
                  className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
                >
                  {showHistory ? 'Yalnızca son sürümü göster' : `Önceki ${allLogs.length - 1} güncelleme notunu gör ›`}
                </button>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.08] bg-zinc-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="rounded accent-amber-500"
                />
                <span>Bu bildirimi tekrar gösterme</span>
              </label>

              <AnimatedButton size="sm" variant="primary" onClick={handleClose}>
                Kapat
              </AnimatedButton>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
