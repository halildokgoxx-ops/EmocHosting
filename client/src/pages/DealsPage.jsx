import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { CopyIcon, CouponTagIcon, TrophyIcon } from '../components/icons/EmoIcons';

function formatCountdown(targetMs) {
  const diff = Math.max(0, Number(targetMs || 0) - Date.now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${d}g ${String(h).padStart(2, '0')}sa ${String(m).padStart(2, '0')}dk ${String(s).padStart(2, '0')}sn`;
}

const TIER_STYLES = {
  common: { border: 'border-zinc-500/40', badge: 'bg-zinc-800 text-zinc-200', glow: 'from-zinc-700/20 to-transparent' },
  uncommon: { border: 'border-sky-500/45', badge: 'bg-sky-500/20 text-sky-300', glow: 'from-sky-500/15 to-transparent' },
  rare: { border: 'border-amber-500/50', badge: 'bg-amber-500/20 text-amber-300', glow: 'from-amber-500/20 to-transparent' },
  epic: { border: 'border-orange-500/55', badge: 'bg-orange-500/20 text-orange-300', glow: 'from-orange-500/20 to-transparent' },
  ultra: { border: 'border-rose-500/55', badge: 'bg-rose-500/20 text-rose-300', glow: 'from-rose-500/20 to-transparent' },
  mythic: { border: 'border-yellow-400/75', badge: 'bg-yellow-400/25 text-yellow-200', glow: 'from-yellow-400/25 to-transparent' },
};

export function DealsPage() {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [nightMarket, setNightMarket] = useState(null);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [openingSlot, setOpeningSlot] = useState(null);
  const [, setTick] = useState(0);

  const loadNightMarket = useCallback(async () => {
    if (!firebaseUser) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiRequest('/api/deals/night-market');
      setEnabled(data.enabled !== false);
      setNightMarket(data.nightMarket || null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [firebaseUser, toast]);

  useEffect(() => {
    loadNightMarket();
  }, [loadNightMarket]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  async function openBox(slot) {
    if (!firebaseUser) {
      navigate('/auth');
      return;
    }
    setOpeningSlot(slot);
    try {
      const res = await apiRequest(`/api/deals/night-market/open/${slot}`, { method: 'POST' });
      setNightMarket(res.nightMarket);
      trackEvent('night_market_open', { slot, discountPct: res.box.discountPct });
      toast.success(`Tebrikler! %${res.box.discountPct} indirim kuponu çıktı: ${res.box.couponCode}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setOpeningSlot(null);
    }
  }

  const boxes = nightMarket?.boxes || [
    { slot: 0, opened: false },
    { slot: 1, opened: false },
    { slot: 2, opened: false },
  ];

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <SeoHead
        title="Fırsatlar & Gece Pazarı"
        description="Haftalık Gece Pazarı gizemli kutularını açın; Minecraft, web ve bot hosting paketlerinde %10 ila %50 arası anında indirim kuponları kazanın."
      />

      {/* Hero Header */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 border-amber-500/30">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>HAFTALIK GECE PAZARI</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-white">
            Gizemli İndirim Kutuları
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl">
            Tıpkı efsanevi Gece Pazarı konsepti gibi, her hafta hesabınıza özel 3 kapalı fırsat kartı tanımlanır. Kutulara tıklayın, şansınıza göre %10 ile %50 arası gerçek tek kullanımlık indirim kodları kazanın!
          </p>
        </div>

        <div className="shrink-0 p-4 rounded-xl bg-[#09090b] border border-white/[0.08] text-center min-w-[210px]">
          <div className="text-[11px] font-mono uppercase text-zinc-500">Haftalık Yenilenme</div>
          <div className="font-mono text-base sm:text-lg font-bold text-amber-400 mt-1">
            {nightMarket?.nextResetAt ? formatCountdown(nightMarket.nextResetAt) : 'Haftalık'}
          </div>
        </div>
      </div>

      {!enabled ? (
        <div className="glass-panel rounded-2xl p-12 text-center text-sm text-zinc-400">
          Gece Pazarı şu anda yönetici tarafından geçici olarak kapatılmıştır.
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass-panel rounded-2xl h-80 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {boxes.map((box, idx) => {
            const opened = Boolean(box.opened);
            const tier = TIER_STYLES[box.tier || 'rare'] || TIER_STYLES.rare;
            const isOpening = openingSlot === box.slot;

            return (
              <motion.div
                key={box.slot}
                initial={{ opacity: 0, y: 16 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  rotateY: isOpening ? [0, 90, 0] : 0,
                }}
                transition={{ duration: isOpening ? 0.55 : 0.35, delay: idx * 0.07 }}
                className={`relative rounded-2xl border p-6 min-h-[340px] flex flex-col justify-between overflow-hidden bg-[#111216] transition-all ${
                  opened ? tier.border : 'border-white/10 hover:border-amber-500/55 shadow-xl'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-b pointer-events-none ${opened ? tier.glow : 'from-amber-500/[0.07] to-transparent'}`} />

                {!opened ? (
                  <>
                    <div className="relative z-10 flex items-center justify-between text-xs">
                      <span className="font-mono text-zinc-500">KUTU #{box.slot + 1}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-white/[0.08] text-amber-400 font-bold">
                        Kilitli
                      </span>
                    </div>

                    <div className="relative z-10 flex flex-col items-center justify-center py-6 space-y-4">
                      <motion.div
                        animate={{ scale: isOpening ? [1, 1.15, 0.95] : [1, 1.04, 1] }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-24 h-24 rounded-2xl bg-[#09090b] border border-amber-500/40 flex items-center justify-center shadow-[0_0_40px_-10px_rgba(245,158,11,0.35)]"
                      >
                        <picture>
                          <source srcSet="/assets/lion-emblem.webp" type="image/webp" />
                          <img
                            src="/assets/lion-emblem.jpg"
                            alt="EmoçHosting Gece Pazarı gizemli Aslan kutusu amblemi"
                            width={64}
                            height={64}
                            loading="lazy"
                            decoding="async"
                            className="w-16 h-16 rounded-xl object-cover opacity-90"
                          />
                        </picture>
                      </motion.div>
                      <div className="text-center">
                        <div className="font-display font-bold text-lg text-white">Gizemli Teklif</div>
                        <div className="text-xs text-zinc-400 mt-1">%10 – %50 İndirim Şansı</div>
                      </div>
                    </div>

                    <div className="relative z-10">
                      <AnimatedButton
                        variant="primary"
                        loading={isOpening}
                        onClick={() => openBox(box.slot)}
                        className="w-full"
                      >
                        {firebaseUser ? 'Kutuyu Aç ve İndirimi Gör' : 'Açmak İçin Giriş Yap'}
                      </AnimatedButton>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="relative z-10 flex items-center justify-between text-xs">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold ${tier.badge}`}>
                        {box.tierLabel || 'Özel Fırsat'}
                      </span>
                      <span className="font-mono text-zinc-400">
                        {box.categoryFilter === 'all' ? 'Tüm Paketler' : box.categoryFilter.toUpperCase()}
                      </span>
                    </div>

                    <div className="relative z-10 text-center py-4 space-y-3">
                      <div className="font-display text-6xl font-black text-white tracking-tight">
                        %{box.discountPct}
                      </div>
                      <div className="text-xs text-zinc-300 font-semibold uppercase tracking-wider">
                        Anında İndirim Hakkı
                      </div>

                      <div className="p-3 rounded-xl bg-[#09090b] border border-white/10 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CouponTagIcon className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="font-mono font-bold text-sm text-amber-300 truncate">
                            {box.couponCode}
                          </span>
                        </div>
                        <button
                          type="button"
                          aria-label={`Kupon kodu ${box.couponCode} kopyala`}
                          onClick={() => {
                            navigator.clipboard.writeText(box.couponCode);
                            toast.success('Kupon kodu kopyalandı!');
                          }}
                          className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shrink-0"
                        >
                          <CopyIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="relative z-10">
                      {box.used ? (
                        <AnimatedButton disabled variant="ghost" className="w-full">
                          Bu Kupon Kullanıldı
                        </AnimatedButton>
                      ) : (
                        <AnimatedButton
                          variant="emerald"
                          onClick={() =>
                            navigate(
                              `/packages?coupon=${encodeURIComponent(box.couponCode)}${
                                box.categoryFilter && box.categoryFilter !== 'all' ? `&cat=${box.categoryFilter}` : ''
                              }`
                            )
                          }
                          className="w-full"
                        >
                          Mağazada Hemen Kullan
                        </AnimatedButton>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Giveaways Cross-Link */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrophyIcon className="w-6 h-6 text-amber-400" />
          <div>
            <div className="font-bold text-white text-sm">Aktif Topluluk Çekilişlerini Kaçırma</div>
            <div className="text-xs text-zinc-400">Ücretsiz bakiye ve dev indirim kuponları için tek tıkla katılım sağla.</div>
          </div>
        </div>
        <AnimatedButton size="sm" variant="secondary" onClick={() => navigate('/giveaways')}>
          Çekilişlere Git
        </AnimatedButton>
      </div>
    </div>
  );
}
