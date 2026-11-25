import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback((message, type = 'info') => {
    const cleanMsg = String(message || '').trim();
    if (!cleanMsg) return;

    const dedupeKey = `${type}:${cleanMsg}`;
    const now = Date.now();
    const lastShown = recentRef.current.get(dedupeKey) || 0;
    if (now - lastShown < 5000) return;
    recentRef.current.set(dedupeKey, now);

    // Prune old dedupe entries
    if (recentRef.current.size > 40) {
      for (const [k, ts] of recentRef.current.entries()) {
        if (now - ts > 10000) recentRef.current.delete(k);
      }
    }

    const id = `${now}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, message: cleanMsg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const toast = {
    success: (m) => pushToast(m, 'success'),
    error: (m) => pushToast(m, 'error'),
    warning: (m) => pushToast(m, 'warning'),
    info: (m) => pushToast(m, 'info'),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-20 lg:bottom-5 left-3 right-3 sm:left-auto sm:right-5 z-[100] flex flex-col gap-2 sm:max-w-sm w-auto sm:w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const colors =
              t.type === 'success'
                ? 'border-emerald-400/40 bg-emerald-950/95 text-emerald-200'
                : t.type === 'error'
                ? 'border-rose-400/40 bg-rose-950/95 text-rose-200'
                : t.type === 'warning'
                ? 'border-amber-400/40 bg-amber-950/95 text-amber-200'
                : 'border-cyan-400/40 bg-slate-900/95 text-cyan-100';
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                className={`pointer-events-auto rounded-2xl border px-4 py-3 text-xs sm:text-sm font-medium shadow-2xl backdrop-blur-xl flex items-start justify-between gap-3 ${colors}`}
              >
                <span className="break-words min-w-0 flex-1">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismissToast(t.id)}
                  className="text-current/60 hover:text-current text-xs font-bold shrink-0 px-1"
                  aria-label="Kapat"
                >
                  ✕
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
