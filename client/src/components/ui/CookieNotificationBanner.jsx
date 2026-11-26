import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from './AnimatedButton';
import { BellIcon, ShieldAdminIcon } from '../icons/EmoIcons';
import { getCookieConsentState, saveCookieConsent } from '../../lib/analytics';

export function CookieNotificationBanner() {
  const { bootstrap } = useAuth();
  const toast = useToast();
  const cookieEnabled = bootstrap?.config?.cookieBannerEnabled !== false;
  const [cookieDone, setCookieDone] = useState(true);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);

  useEffect(() => {
    const state = getCookieConsentState();
    setAnalyticsEnabled(Boolean(state.prefs?.analytics));
    if (!state.decided) {
      setCookieDone(false);
    } else {
      const dismissedPush = localStorage.getItem('emoc_push_dismissed') === '1';
      if (
        !dismissedPush &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'default'
      ) {
        const timer = setTimeout(() => setPushPromptOpen(true), 1200);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    const onOpenSettings = () => {
      const state = getCookieConsentState();
      setAnalyticsEnabled(Boolean(state.prefs?.analytics));
      setCustomizeOpen(true);
      setCookieDone(false);
    };
    window.addEventListener('emoc:open-cookie-settings', onOpenSettings);
    return () => window.removeEventListener('emoc:open-cookie-settings', onOpenSettings);
  }, []);

  function acceptCookies(analytics) {
    saveCookieConsent({ analytics: Boolean(analytics) });
    setAnalyticsEnabled(Boolean(analytics));
    setCustomizeOpen(false);
    setCookieDone(true);
    toast.success(
      analytics
        ? 'Tüm çerez ve anonim performans tercihleriniz kaydedildi.'
        : 'Yalnızca zorunlu güvenlik ve oturum çerezleri aktif edildi.'
    );
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default' &&
      localStorage.getItem('emoc_push_dismissed') !== '1'
    ) {
      setTimeout(() => setPushPromptOpen(true), 450);
    }
  }

  async function requestPush() {
    if (typeof Notification === 'undefined') {
      localStorage.setItem('emoc_push_dismissed', '1');
      setPushPromptOpen(false);
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      localStorage.setItem('emoc_push_dismissed', '1');
      setPushPromptOpen(false);
      if (perm === 'granted') {
        toast.success('Tarayıcı bildirimleri açıldı! Çekiliş ve sunucu durumları anında iletilecek.');
        new Notification('EmoçHosting Bildirimleri Aktif', {
          body: 'Çekiliş sonuçları, sunucu açılış/kapanış ve bakiye güncellemeleri artık anında bildirilecek.',
          icon: '/assets/icon-192.png',
        });
      } else {
        toast.info('Bildirim izni verilmedi; site içi bildirim zilinden takip edebilirsiniz.');
      }
    } catch {
      setPushPromptOpen(false);
    }
  }

  function dismissPush() {
    localStorage.setItem('emoc_push_dismissed', '1');
    setPushPromptOpen(false);
  }

  if (!cookieEnabled) return null;

  return (
    <>
      <AnimatePresence>
        {!cookieDone && (
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-labelledby="cookie-consent-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-20 lg:bottom-5 left-3 right-3 sm:left-5 sm:right-auto sm:max-w-md z-[90] rounded-2xl border border-white/[0.14] bg-[#111216]/95 backdrop-blur-xl p-4 sm:p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <ShieldAdminIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1">
                <h2 id="cookie-consent-title" className="font-display text-sm font-bold text-white">
                  Çerez &amp; Gizlilik Tercihleri
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Oturum güvenliği için zorunlu çerezleri kullanıyoruz. İsteğe bağlı anonim analitik çerezlerini seçebilir; detaylı bilgi için{' '}
                  <Link to="/cerez-politikasi" className="text-amber-400 underline hover:text-amber-300">
                    Çerez
                  </Link>{' '}
                  ve{' '}
                  <Link to="/gizlilik-politikasi" className="text-amber-400 underline hover:text-amber-300">
                    Gizlilik Politikamızı
                  </Link>{' '}
                  inceleyebilirsiniz.
                </p>
              </div>
            </div>

            {customizeOpen && (
              <div className="space-y-2 pt-1 text-xs">
                <div className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/10 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-white">Zorunlu Güvenlik Çerezleri</div>
                    <div className="text-[11px] text-zinc-400">Oturum, kimlik doğrulama ve CSRF koruması</div>
                  </div>
                  <span className="text-[11px] font-bold text-emerald-400 shrink-0">Her Zaman Açık</span>
                </div>

                <label className="p-2.5 rounded-xl bg-zinc-900/90 border border-white/10 flex items-center justify-between gap-3 cursor-pointer hover:border-amber-500/35">
                  <div>
                    <div className="font-semibold text-white">Performans &amp; Anonim Analitik</div>
                    <div className="text-[11px] text-zinc-400">Hız ve sayfa deneyimi iyileştirme ölçümleri</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={analyticsEnabled}
                    onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 shrink-0"
                    aria-label="Performans ve anonim analitik çerezlerine izin ver"
                  />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AnimatedButton size="xs" variant="primary" onClick={() => acceptCookies(true)}>
                Tümünü Kabul Et
              </AnimatedButton>
              <AnimatedButton size="xs" variant="secondary" onClick={() => acceptCookies(false)}>
                Sadece Zorunlu
              </AnimatedButton>
              {customizeOpen ? (
                <AnimatedButton size="xs" variant="emerald" onClick={() => acceptCookies(analyticsEnabled)}>
                  Seçimi Kaydet
                </AnimatedButton>
              ) : (
                <AnimatedButton size="xs" variant="ghost" onClick={() => setCustomizeOpen(true)}>
                  Tercihleri Yönet
                </AnimatedButton>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {cookieDone && pushPromptOpen && (
          <motion.div
            role="dialog"
            aria-modal="false"
            aria-labelledby="push-prompt-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-20 lg:bottom-5 left-3 right-3 sm:left-5 sm:right-auto sm:max-w-md z-[90] rounded-2xl border border-amber-500/35 bg-[#111216]/95 backdrop-blur-xl p-4 sm:p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <BellIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1">
                <h2 id="push-prompt-title" className="font-display text-sm font-bold text-white">
                  Çekilişlerden ve Sunuculardan Haberdar Olun
                </h2>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  Çekiliş kazançları, yeni çekilişler, sunucu açılış/kapanış ve bakiye güncellemeleri için anlık bildirim ister misiniz?
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <AnimatedButton size="xs" variant="primary" onClick={requestPush}>
                Bildirimlere İzin Ver
              </AnimatedButton>
              <AnimatedButton size="xs" variant="ghost" onClick={dismissPush}>
                Daha Sonra
              </AnimatedButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
