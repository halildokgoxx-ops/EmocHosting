import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { CategoryIcon, CouponTagIcon, WalletCoinIcon, ArrowRightIcon, SearchGlassIcon } from '../components/icons/EmoIcons';

const CATEGORIES = [
  { id: 'all', label: 'Tüm Paketler' },
  { id: 'minecraft', label: 'Minecraft Host' },
  { id: 'web', label: 'Website Host' },
  { id: 'discord', label: 'Discord Bot Host' },
  { id: 'altyapi', label: 'Altyapı Node' },
];

export function PackagesPage() {
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(searchParams.get('cat') || 'all');
  const [cycle, setCycle] = useState('monthly');
  const [selectedPkg, setSelectedPkg] = useState(null);
  const [serverName, setServerName] = useState('');
  const [couponCode, setCouponCode] = useState(searchParams.get('coupon') || '');
  const [couponCheck, setCouponCheck] = useState(null);
  const [buying, setBuying] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [targetLoad, setTargetLoad] = useState(25);
  const [heavyMods, setHeavyMods] = useState(false);
  const [compareIds, setCompareIds] = useState([]);

  const { bootstrap, firebaseUser, user, refreshProfile, refreshBootstrap } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const packages = bootstrap?.packages || [];
  const cfg = bootstrap?.config || {};

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchQuery(q);
  }, [searchParams]);

  useEffect(() => {
    const selId = searchParams.get('select');
    if (selId && packages.length) {
      const found = packages.find((p) => p.id === selId);
      if (found) setSelectedPkg(found);
    }
  }, [searchParams, packages]);

  useEffect(() => {
    if (!selectedPkg) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setSelectedPkg(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedPkg]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return packages.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.description || ''} ${p.category} ${p.badge || ''}`.toLowerCase().includes(q);
    });
  }, [packages, category, searchQuery]);

  const estimatedNeededRamMb = useMemo(() => {
    const base = category === 'web' || category === 'discord' ? 512 : 1024;
    const factor = heavyMods ? 115 : 65;
    return Math.round((base + targetLoad * factor) / 256) * 256;
  }, [category, targetLoad, heavyMods]);

  const recommendedId = useMemo(() => {
    if (filtered.length === 0) return null;
    const sortedByRam = [...filtered].sort((a, b) => Number(a.ramMb || 0) - Number(b.ramMb || 0));
    const bestFit = sortedByRam.find((p) => Number(p.ramMb || 0) >= estimatedNeededRamMb);
    return (bestFit || sortedByRam[sortedByRam.length - 1])?.id || null;
  }, [filtered, estimatedNeededRamMb]);

  const comparePackages = useMemo(
    () => compareIds.map((id) => packages.find((p) => p.id === id)).filter(Boolean),
    [compareIds, packages]
  );

  function toggleCompare(id) {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      trackEvent('package_compare', id);
      if (prev.length >= 3) {
        toast.info('Aynı anda en fazla 3 paketi karşılaştırabilirsiniz.');
        return [...prev.slice(1), id];
      }
      return [...prev, id];
    });
  }

  const catalogJsonLd = useMemo(() => {
    if (!packages.length) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'OfferCatalog',
      name: 'EmoçHosting Sunucu Paketleri',
      itemListElement: packages.slice(0, 15).map((pkg) => ({
        '@type': 'Offer',
        name: pkg.name,
        description: `${pkg.description || `${pkg.ramMb} MB RAM, ${pkg.cpuCores} vCPU sunucu paketi`} — Aylık ${Number(pkg.priceMonthly || 0)} İnvite`,
        availability: pkg.paused ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      })),
    };
  }, [packages]);

  function getBasePrice(pkg) {
    if (cycle === 'daily') return Number(pkg.priceDaily || 5);
    if (cycle === 'weekly') return Number(pkg.priceWeekly || 30);
    return Number(pkg.priceMonthly || 100);
  }

  function getEffectivePrice(pkg) {
    let p = getBasePrice(pkg);
    if (cfg.flashSalePercent > 0 && (!cfg.flashSaleEndsAt || Date.now() < cfg.flashSaleEndsAt)) {
      p = Math.max(0, p * (1 - Number(cfg.flashSalePercent) / 100));
    }
    return Number(p.toFixed(2));
  }

  async function validateCoupon() {
    if (!selectedPkg || !couponCode.trim()) return;
    try {
      const data = await apiRequest('/api/store/validate-coupon', {
        method: 'POST',
        body: { code: couponCode, packageId: selectedPkg.id, billingCycle: cycle },
      });
      setCouponCheck(data);
      toast.success(`Kupon uygulandı! İndirim: -${data.couponDiscount} İnvite`);
    } catch (err) {
      setCouponCheck(null);
      toast.error(err.message);
    }
  }

  async function handlePurchase(e) {
    e.preventDefault();
    if (!firebaseUser) {
      toast.warning('Sunucu kurmak için önce giriş yapmalısınız.');
      navigate('/auth');
      return;
    }
    setBuying(true);
    try {
      const res = await apiRequest('/api/store/purchase', {
        method: 'POST',
        body: {
          packageId: selectedPkg.id,
          billingCycle: cycle,
          serverName,
          couponCode: couponCheck ? couponCheck.code : couponCode,
        },
      });
      toast.success(`"${res.server.name}" (${res.server.domainAddress}) kuruldu!`);
      trackEvent('package_purchase', { category: selectedPkg.category, billingCycle: cycle });
      await Promise.all([refreshProfile(), refreshBootstrap()]);
      setSelectedPkg(null);
      navigate(`/servers/${res.server.id}`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBuying(false);
    }
  }

  const previewSlug =
    (serverName || 'sunucum')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 18) || 'srv';

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <SeoHead
        title="Mağaza & Hosting Paketleri"
        description="Minecraft, Discord Bot, Website ve özel altyapı paketlerini günlük, haftalık veya aylık sürelerle hemen kurun. NVMe SSD ve anlık aktivasyon."
        structuredData={catalogJsonLd}
      />

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2">
          <span className="text-xs font-mono uppercase tracking-[0.22em] text-amber-400">Gerçek Kaynak Tahsisi</span>
          <h1 className="font-display text-3xl sm:text-5xl font-black text-white">Mağaza &amp; Paketler</h1>
          <p className="text-zinc-400 text-sm sm:text-base max-w-2xl">
            Günlük, haftalık veya aylık süre seçin.{' '}
            <Link to="/deals" className="text-amber-400 underline hover:text-amber-300">
              Gece Pazarı fırsatlarını
            </Link>{' '}
            açarak ek indirim kuponları kullanabilirsiniz.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-xl bg-zinc-900 border border-white/[0.08] self-start">
          {[
            { id: 'daily', label: 'Günlük' },
            { id: 'weekly', label: 'Haftalık' },
            { id: 'monthly', label: 'Aylık' },
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCycle(c.id);
                setCouponCheck(null);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                cycle === c.id ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Database Connection Preview Notice */}
      {cfg._dbUnavailable && (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 flex items-center justify-between gap-3">
          <span>
            Mağaza kataloğu şu anda önizleme modunda gösteriliyor. Sipariş ve hesap işlemleri için sunucu veritabanı anahtarı güncellenmelidir.
          </span>
        </div>
      )}

      {/* Interactive Capacity & Slot Calculator */}
      <div className="glass-panel rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 border-amber-500/20">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400">Akıllı Kapasite &amp; RAM Hesaplayıcı</span>
            <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-mono text-amber-300 font-bold">
              Öneri: {(estimatedNeededRamMb / 1024).toFixed(1)} GB+ RAM
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            Tahmini eşzamanlı kullanıcı/oyuncu yoğunluğunu ve mod yükünü seçin, size en verimli paketi otomatik işaretleyelim.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-[210px] space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-zinc-300">
              <label htmlFor="capacity-load-slider">Eşzamanlı Yük</label>
              <span className="text-amber-300 font-bold">{targetLoad} kişi / istek</span>
            </div>
            <input
              id="capacity-load-slider"
              type="range"
              min={5}
              max={150}
              step={5}
              value={targetLoad}
              onChange={(e) => setTargetLoad(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs text-zinc-200 cursor-pointer hover:border-amber-500/40 shrink-0">
            <input
              type="checkbox"
              checked={heavyMods}
              onChange={(e) => setHeavyMods(e.target.checked)}
              className="accent-amber-500"
            />
            <span>Ağır Mod / Plugin Yükü</span>
          </label>
        </div>
      </div>

      {/* Category Filter Pills & Live Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition flex items-center gap-2 ${
                category === cat.id
                  ? 'bg-amber-500/15 border-amber-500/45 text-amber-300'
                  : 'bg-zinc-900 border-white/[0.08] text-zinc-400 hover:text-white'
              }`}
            >
              {cat.id !== 'all' && <CategoryIcon category={cat.id} className="w-4 h-4" />}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="relative md:w-72">
          <label htmlFor="package-search-input" className="sr-only">Paket ara</label>
          <SearchGlassIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
          <input
            id="package-search-input"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Paket veya RAM ara (örn: 8GB, Paper)..."
            className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-xs text-white outline-none focus:border-amber-500/50"
          />
        </div>
      </div>

      {/* Packages Grid */}
      {filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center text-sm text-zinc-400">
          Arama veya filtre kriterine uyan paket bulunamadı.
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((pkg, idx) => {
          const base = getBasePrice(pkg);
          const final = getEffectivePrice(pkg);
          const isRecommended = pkg.id === recommendedId;
          const isCompared = compareIds.includes(pkg.id);
          return (
            <motion.div
              key={pkg.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(0.25, idx * 0.04) }}
              className={`glass-panel glass-card-hover rounded-2xl p-6 flex flex-col justify-between gap-6 relative ${
                isRecommended ? 'border-amber-400/65 ring-1 ring-amber-500/25' : pkg.featured ? 'border-amber-500/40' : ''
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-3 left-5 px-3 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-950 text-[10px] font-black uppercase tracking-wider shadow">
                  Size Özel En İyi Eşleşme
                </span>
              )}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center shrink-0">
                      <CategoryIcon category={pkg.category} className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono uppercase text-amber-400">{pkg.category}</div>
                      <h3 className="font-display text-lg font-bold text-white truncate">{pkg.name}</h3>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pkg.badge && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
                        {pkg.badge}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-pressed={isCompared}
                      onClick={() => toggleCompare(pkg.id)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                        isCompared
                          ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                          : 'bg-zinc-900 border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {isCompared ? 'Seçildi' : '+ Kıyasla'}
                    </button>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{pkg.description}</p>

                <div className="flex items-baseline gap-2 pt-1">
                  <span className="font-display text-3xl sm:text-4xl font-black text-white">{final} İnvite</span>
                  {final < base && <span className="text-sm line-through text-zinc-500">{base} İnvite</span>}
                  <span className="text-xs text-zinc-400">
                    / {cycle === 'daily' ? 'Gün' : cycle === 'weekly' ? 'Hafta' : 'Ay'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="text-zinc-400">RAM Bellek</div>
                    <div className="font-bold text-white mt-0.5">{pkg.ramMb} MB</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="text-zinc-400">İşlemci Gücü</div>
                    <div className="font-bold text-white mt-0.5">{pkg.cpuCores} vCPU ({pkg.cpuLimitPct}%)</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="text-zinc-400">NVMe Disk</div>
                    <div className="font-bold text-white mt-0.5">{(pkg.diskMb / 1024).toFixed(1)} GB</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#09090b] border border-white/[0.06]">
                    <div className="text-zinc-400">Yedek / Domain</div>
                    <div className="font-bold text-white mt-0.5">{pkg.backupsLimit} Yedek • .emochost.com</div>
                  </div>
                </div>
              </div>

              <AnimatedButton
                disabled={pkg.paused}
                variant={pkg.paused ? 'ghost' : pkg.featured ? 'primary' : 'secondary'}
                onClick={() => {
                  trackEvent('package_select', pkg.id);
                  if (!firebaseUser) {
                    toast.info('Sipariş için önce giriş yapın');
                    navigate('/auth');
                    return;
                  }
                  setSelectedPkg(pkg);
                  setServerName(`${pkg.category}-sunucum`);
                  setCouponCheck(null);
                }}
                className="w-full"
              >
                {pkg.paused ? 'Yönetici Tarafından Duraklatıldı' : 'Anında Kurulum Başlat'}
                {!pkg.paused && <ArrowRightIcon className="w-4 h-4" />}
              </AnimatedButton>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* Side-by-Side Comparison Matrix */}
      {comparePackages.length >= 2 && (
        <div className="glass-panel-luminous rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-white">Yan Yana Paket Karşılaştırması ({comparePackages.length}/3)</h2>
              <p className="text-xs text-zinc-400">Seçtiğiniz paketlerin donanım, fiyat ve GB başına maliyet karşılaştırması</p>
            </div>
            <AnimatedButton size="xs" variant="ghost" onClick={() => setCompareIds([])}>
              Temizle
            </AnimatedButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse tabular-nums">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400">
                  <th className="py-2.5 pr-4">Özellik</th>
                  {comparePackages.map((p) => (
                    <th key={p.id} className="py-2.5 px-3 text-white font-display font-bold">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-zinc-200">
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">Dönem Fiyatı</td>
                  {comparePackages.map((p) => (
                    <td key={p.id} className="py-2.5 px-3 font-bold text-amber-300">
                      {getEffectivePrice(p)} İnvite
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">RAM Bellek</td>
                  {comparePackages.map((p) => (
                    <td key={p.id} className="py-2.5 px-3">{p.ramMb} MB ({(p.ramMb / 1024).toFixed(1)} GB)</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">CPU Gücü</td>
                  {comparePackages.map((p) => (
                    <td key={p.id} className="py-2.5 px-3">{p.cpuCores} vCPU (%{p.cpuLimitPct})</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">NVMe Depolama</td>
                  {comparePackages.map((p) => (
                    <td key={p.id} className="py-2.5 px-3">{(p.diskMb / 1024).toFixed(1)} GB NVMe</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">Yedek / Bant Genişliği</td>
                  {comparePackages.map((p) => (
                    <td key={p.id} className="py-2.5 px-3">{p.backupsLimit} Yedek • {p.bandwidthGb} GB</td>
                  ))}
                </tr>
                <tr>
                  <td className="py-2.5 pr-4 text-zinc-400">1 GB RAM Maliyet Oranı</td>
                  {comparePackages.map((p) => {
                    const perGb = p.ramMb > 0 ? getEffectivePrice(p) / (p.ramMb / 1024) : 0;
                    return <td key={p.id} className="py-2.5 px-3 text-emerald-300 font-mono">{perGb.toFixed(2)} İnvite / GB</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      <AnimatePresence>
        {selectedPkg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-modal-title"
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setSelectedPkg(null)}
          >
            <motion.form
              initial={{ scale: 0.96, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handlePurchase}
              className="glass-panel max-w-lg w-full rounded-2xl p-6 sm:p-7 space-y-5 border-amber-500/35"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CategoryIcon category={selectedPkg.category} className="w-7 h-7" />
                  <div>
                    <h3 id="checkout-modal-title" className="font-display text-xl font-bold text-white">{selectedPkg.name}</h3>
                    <p className="text-xs text-zinc-400">
                      Süre: {cycle === 'daily' ? '1 Günlük' : cycle === 'weekly' ? '7 Günlük (Haftalık)' : '30 Günlük (Aylık)'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/25">
                  <WalletCoinIcon className="w-4 h-4" />
                  <span>{Number(user?.balance || 0).toFixed(2)} İnvite</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="checkout-server-name" className="block text-xs font-semibold text-zinc-300">Sunucu / Proje Adı</label>
                <input
                  id="checkout-server-name"
                  required
                  minLength={2}
                  maxLength={36}
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Örn: hidiribidiri"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm text-white"
                />
                <div className="text-[11px] font-mono text-zinc-400">
                  Otomatik Adres: <span className="text-amber-400">{previewSlug}-xxxx.emochost.com</span> (Panelden özelleştirilebilir)
                </div>
              </div>

              <div>
                <label htmlFor="checkout-coupon" className="block text-xs font-semibold text-zinc-300 mb-1.5">İndirim / Gece Pazarı Kuponu</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      id="checkout-coupon"
                      maxLength={32}
                      value={couponCode}
                      onChange={(e) => {
                        setCouponCode(e.target.value.toUpperCase());
                        if (couponCheck) setCouponCheck(null);
                      }}
                      placeholder="Örn: EMOC15 veya GECE-XXXXXX"
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm font-mono text-amber-300"
                    />
                    <CouponTagIcon className="w-4 h-4 absolute left-3 top-3 text-amber-400" />
                  </div>
                  <AnimatedButton type="button" variant="secondary" onClick={validateCoupon}>
                    Uygula
                  </AnimatedButton>
                </div>
              </div>

              <div className="rounded-xl bg-[#09090b] border border-white/[0.08] p-4 space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Paket Ücreti</span>
                  <span>{getBasePrice(selectedPkg)} İnvite</span>
                </div>
                {getEffectivePrice(selectedPkg) < getBasePrice(selectedPkg) && (
                  <div className="flex justify-between text-rose-400">
                    <span>Flash İndirim (%{cfg.flashSalePercent})</span>
                    <span>-{(getBasePrice(selectedPkg) - getEffectivePrice(selectedPkg)).toFixed(2)} İnvite</span>
                  </div>
                )}
                {couponCheck && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Kupon ({couponCheck.code})</span>
                    <span>-{couponCheck.couponDiscount} İnvite</span>
                  </div>
                )}
                <div className="border-t border-white/[0.08] pt-2 flex justify-between font-display text-lg font-extrabold text-white">
                  <span>Ödenecek Tutar</span>
                  <span className="text-amber-400">
                    {couponCheck ? couponCheck.finalPrice : getEffectivePrice(selectedPkg)} İnvite
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <AnimatedButton type="button" variant="ghost" onClick={() => setSelectedPkg(null)}>
                  Vazgeç
                </AnimatedButton>
                <AnimatedButton type="submit" variant="primary" loading={buying}>
                  Onayla ve Kur
                </AnimatedButton>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
