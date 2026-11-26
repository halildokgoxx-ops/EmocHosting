import React, { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { safeExternalUrl } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { FAQ_ITEMS, buildFaqJsonLd } from '../data/faqData';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import {
  MinecraftIcon,
  WebsiteIcon,
  DiscordBotIcon,
  AltyapiIcon,
  ArrowRightIcon,
  CpuChipIcon,
  ShieldAdminIcon,
  DiscordBrandIcon,
  GiftInviteIcon,
  TrophyIcon,
  ConsoleTerminalIcon,
} from '../components/icons/EmoIcons';

export function HomePage() {
  const { bootstrap, firebaseUser, currencyLabel } = useAuth();
  const navigate = useNavigate();
  const cfg = bootstrap?.config || {};
  const [cycle, setCycle] = useState('monthly');
  const [openFaq, setOpenFaq] = useState(0);

  React.useEffect(() => {
    if (cfg.defaultBillingCycle && ['daily', 'weekly', 'monthly'].includes(cfg.defaultBillingCycle)) {
      setCycle(cfg.defaultBillingCycle);
    }
  }, [cfg.defaultBillingCycle]);

  const previewFaqs = FAQ_ITEMS.slice(0, 5);
  const faqSchema = useMemo(() => buildFaqJsonLd(FAQ_ITEMS), []);

  const stats = bootstrap?.stats || { totalUsers: 0, totalServers: 0, runningServers: 0, hostUptimeSec: 0 };
  const packages = bootstrap?.packages || [];
  const featuredPackages = packages.filter((p) => p.featured).slice(0, 4);

  const products = [
    {
      key: 'minecraft',
      title: 'Minecraft Host',
      desc: 'EmoçCore, Paper, Purpur, Forge, NeoForge, Fabric, Spigot, Bukkit ve BungeeCord dahil 17 çekirdek; Modrinth + CurseForge tek tık kurulum ve <isim>.emochost.com domain.',
      icon: MinecraftIcon,
      badge: '17 Yazılım • CurseForge • Modrinth',
    },
    {
      key: 'web',
      title: 'Website Host',
      desc: 'Anlık yayın, <isim>.emochost.com alt alan adı yönlendirmesi, canlı trafik logları, dosya editörü ve hazır web şablonları.',
      icon: WebsiteIcon,
      badge: 'Statik • Dinamik • Canlı Domain',
    },
    {
      key: 'discord',
      title: 'Discord Bot Host',
      desc: '7/24 kesintisiz bot süreçleri, güvenli değişken kasası, canlı paket kurulumu, otomatik kurtarma ve gerçek zamanlı konsol.',
      icon: DiscordBotIcon,
      badge: 'Node • Python • 7/24 Kesintisiz',
    },
    {
      key: 'altyapi',
      title: 'Altyapı & API Node',
      desc: 'REST API, webhook ve özel servisler için yüksek performanslı çalışma ortamı, hızlı veri deposu ve zamanlanmış görevler.',
      icon: AltyapiIcon,
      badge: 'API • Webhook • Zamanlayıcı',
    },
  ];

  const advantages = [
    {
      title: 'Otomatik <isim>.emochost.com',
      desc: 'Her sunucu kurulduğunda port ezberlemeden özel alt alan adı ve otomatik akıllı bağlantı yönlendirmesi alır.',
    },
    {
      title: 'Akıllı Sunucu Teşhis Asistanı',
      desc: 'Sunucu günlüklerini, başlatma ayarlarını, bellek durumunu ve değişken dosyalarınızı tarar; tek tıkla optimizasyon ve düzeltme uygular.',
    },
    {
      title: 'Haftalık Gece Pazarı',
      desc: 'Her hafta yenilenen 3 gizemli fırsat kutusunu açın, %50’ye varan gerçek tek kullanımlık indirim kodları kazanın.',
    },
    {
      title: 'Şeffaf Çekiliş Sistemi',
      desc: 'Yönetici tarafından başlatılan aktif çekilişlere tek tıkla katılın; süre dolduğunda kazananlar tarafsız ve otomatik biçimde seçilir.',
    },
  ];

  const getPrice = (pkg) => {
    const raw = cycle === 'daily' ? pkg.priceDaily : cycle === 'weekly' ? pkg.priceWeekly : pkg.priceMonthly;
    if (cfg.flashSalePercent > 0 && (!cfg.flashSaleEndsAt || Date.now() < cfg.flashSaleEndsAt)) {
      return Math.max(0, Number((raw * (1 - cfg.flashSalePercent / 100)).toFixed(2)));
    }
    return raw;
  };

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-12 space-y-16 sm:space-y-20">
      <SeoHead structuredData={faqSchema} />

      {/* HERO SECTION */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="lg:col-span-6 space-y-6"
        >
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-zinc-900 border border-white/10 text-zinc-300 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>{cfg.heroBadgeText || 'NVMe Gücü • Gerçek Süreç Motoru • Otomatik Domain'}</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black leading-[1.06] tracking-tight text-white">
            Aslan Gücünde <br />
            <span className="text-gradient-cyber">Sade, Hızlı ve Gerçek</span> <br />
            Sunucu Yönetimi.
          </h1>

          <p className="text-sm sm:text-base text-zinc-300 leading-relaxed max-w-xl">
            <strong className="text-white">EmoçHosting</strong> ile Minecraft (CurseForge &amp; Modrinth), Discord Bot, Website ve Altyapı sunucularınızı; simülasyon içermeyen gerçek süreçler, canlı SFTP, AI teşhis ve haftalık Gece Pazarı ayrıcalıklarıyla saniyeler içinde başlatın.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <AnimatedButton
              size="lg"
              variant="primary"
              onClick={() => {
                trackEvent('cta_click', 'hero_primary_packages');
                navigate('/packages');
              }}
            >
              <span>Hemen Sunucunu Kur</span>
              <ArrowRightIcon className="w-4 h-4" />
            </AnimatedButton>

            <AnimatedButton
              size="lg"
              variant="secondary"
              onClick={() => {
                trackEvent('cta_click', firebaseUser ? 'hero_my_servers' : 'hero_register');
                navigate(firebaseUser ? '/servers' : '/auth?tab=register');
              }}
            >
              <ConsoleTerminalIcon className="w-4 h-4 text-amber-400" />
              <span>{firebaseUser ? 'Hizmetlerime Git' : 'Ücretsiz Hesap Aç'}</span>
            </AnimatedButton>
          </div>

          <div className="text-xs text-zinc-400 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to="/deals" className="text-amber-300 hover:text-amber-200 underline underline-offset-4">
              Haftalık Gece Pazarı Fırsatları (%50&apos;ye varan indirim)
            </Link>
            <span aria-hidden="true">•</span>
            <Link to="/sss" className="hover:text-zinc-200 underline underline-offset-4">
              Sıkça Sorulan Sorular
            </Link>
          </div>

          {/* Clean Live Stats Strip */}
          {cfg.showLiveStatsStrip !== false && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { label: 'Toplam Sunucu', value: stats.totalServers, color: 'text-white' },
                { label: 'Aktif Çalışan', value: stats.runningServers, color: 'text-emerald-400' },
                { label: 'Kayıtlı Üye', value: stats.totalUsers, color: 'text-amber-400' },
                {
                  label: 'Node Uptime',
                  value: `${Math.floor((stats.hostUptimeSec || 0) / 3600)}sa`,
                  color: 'text-zinc-200',
                },
              ].map((s) => (
                <div key={s.label} className="glass-panel rounded-2xl px-4 py-3">
                  <div className={`font-display text-2xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Right Architectural Visual */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="lg:col-span-6 relative"
        >
          <div className="relative rounded-3xl overflow-hidden border border-white/10 shadow-2xl bg-[#111216]">
            <picture>
              <source srcSet="/assets/hero-datacenter.webp" type="image/webp" />
              <img
                src="/assets/hero-datacenter.jpg"
                alt="EmoçHosting yüksek hızlı NVMe veri merkezi ve sunucu kabinleri"
                width={1376}
                height={768}
                fetchpriority="high"
                decoding="async"
                className="w-full h-[340px] sm:h-[420px] object-cover opacity-75 saturate-50 contrast-110"
              />
            </picture>
            <div className="absolute inset-0 bg-gradient-to-t from-[#09090b] via-[#09090b]/40 to-transparent" />

            {/* Floating Lion Crest Card */}
            <div className="absolute top-3 left-3 right-3 sm:left-auto sm:top-4 sm:right-4 glass-panel rounded-2xl p-2.5 sm:p-3 flex items-center gap-3">
              <picture>
                <source srcSet="/assets/lion-emblem.webp" type="image/webp" />
                <img
                  src="/assets/lion-emblem.jpg"
                  alt="EmoçHosting Aslan Arması Logosu"
                  width={48}
                  height={48}
                  decoding="async"
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl object-cover border border-amber-500/40 shrink-0"
                />
              </picture>
              <div className="text-xs min-w-0">
                <div className="font-bold text-white truncate">Yüksek Hızlı Bulut Altyapı</div>
                <div className="text-amber-400 flex items-center gap-1.5 mt-0.5 truncate">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>Anlık Kurulum • Düşük Gecikme</span>
                </div>
              </div>
            </div>

            <div className="absolute bottom-3 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-4 glass-panel rounded-2xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <CpuChipIcon className="w-6 h-6 text-amber-400 shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-400 font-mono truncate">*.emochost.com • Otomatik Alan Adı</div>
                  <div className="text-sm font-bold text-white truncate">Canlı Konsol, SFTP &amp; Akıllı Teşhis</div>
                </div>
              </div>
              <AnimatedButton size="xs" variant="secondary" onClick={() => navigate('/status')}>
                Sistem Durumu
              </AnimatedButton>
            </div>
          </div>
        </motion.div>
      </section>

      {/* DIFFERENTIATORS STRIP */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {advantages.map((item) => (
          <div key={item.title} className="glass-panel rounded-2xl p-5 space-y-2 border border-white/[0.08] hover:border-amber-500/30 transition">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <h2 className="font-display font-bold text-white text-base">{item.title}</h2>
            <p className="text-xs text-zinc-400 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </section>

      {/* 4 PRODUCT PANELS */}
      <section className="space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2.5">
          <span className="text-xs font-mono uppercase tracking-[0.22em] text-amber-400">Her Ürüne Özel Ayrı Panel</span>
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white">
            4 Ürün, Sıfır Karmaşa
          </h2>
          <p className="text-zinc-400 text-sm sm:text-base">
            Seçtiğiniz sunucu türüne göre yalnızca ihtiyacınız olan araçları sunan sade ve ultra hızlı yönetim deneyimi.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {products.map((prod) => {
            const Icon = prod.icon;
            return (
              <Link
                key={prod.key}
                to={`/packages?cat=${prod.key}`}
                className="glass-panel glass-card-hover rounded-2xl p-6 flex flex-col justify-between gap-5 focus:outline-none"
              >
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-white/10 flex items-center justify-center">
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-zinc-900 border border-white/[0.08] text-[11px] font-mono text-zinc-300">
                      {prod.badge}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white">{prod.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{prod.desc}</p>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/[0.07] text-xs font-semibold text-amber-400">
                  <span>Paketleri İncele ve Kur</span>
                  <ArrowRightIcon className="w-4 h-4" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* FEATURED PACKAGES */}
      {featuredPackages.length > 0 && (
        <section className="space-y-7">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-xs font-mono uppercase tracking-[0.22em] text-amber-400">Esnek Süreler</span>
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">Öne Çıkan Paketler</h2>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-zinc-900 border border-white/[0.08] self-start" role="group" aria-label="Faturalandırma periyodu">
              {[
                { id: 'daily', label: 'Günlük' },
                { id: 'weekly', label: 'Haftalık' },
                { id: 'monthly', label: 'Aylık' },
              ].map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={cycle === c.id}
                  onClick={() => setCycle(c.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                    cycle === c.id ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredPackages.map((pkg) => (
              <div key={pkg.id} className="glass-panel glass-card-hover rounded-2xl p-6 flex flex-col justify-between gap-5">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono uppercase px-2.5 py-0.5 rounded-md bg-zinc-900 text-amber-400 border border-white/[0.08]">
                      {pkg.category}
                    </span>
                    {pkg.badge && <span className="text-[11px] font-semibold text-zinc-300">{pkg.badge}</span>}
                  </div>
                  <h3 className="font-display text-lg font-bold text-white">{pkg.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="font-display text-3xl font-black text-white">{getPrice(pkg)} {currencyLabel}</span>
                    <span className="text-xs text-zinc-400">
                      / {cycle === 'daily' ? 'gün' : cycle === 'weekly' ? 'hafta' : 'ay'}
                    </span>
                  </div>
                  <ul className="space-y-1.5 text-xs text-zinc-400 pt-2 border-t border-white/[0.06]">
                    <li>• {(pkg.ramMb / 1024).toFixed(1)} GB RAM ({pkg.ramMb} MB)</li>
                    <li>• {pkg.cpuCores} vCPU ({pkg.cpuLimitPct}% Güç)</li>
                    <li>• {Math.round(pkg.diskMb / 1024)} GB NVMe Disk</li>
                    <li>• {pkg.backupsLimit} Yedek • Otomatik Domain</li>
                  </ul>
                </div>

                <AnimatedButton
                  variant={pkg.paused ? 'ghost' : 'primary'}
                  disabled={pkg.paused}
                  onClick={() => {
                    trackEvent('cta_click', `featured_${pkg.id}`);
                    navigate(`/packages?cat=${pkg.category}&select=${pkg.id}`);
                  }}
                  className="w-full"
                >
                  {pkg.paused ? 'Geçici Duraklatıldı' : 'Sunucuyu Kur'}
                </AnimatedButton>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* COMMUNITY / NIGHT MARKET / GIVEAWAY CTA */}
      <section className="glass-panel rounded-2xl p-7 sm:p-9 grid grid-cols-1 lg:grid-cols-3 gap-7 items-center border-white/10">
        <div className="lg:col-span-2 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold">
            <GiftInviteIcon className="w-4 h-4" />
            <span>Davet Et • Gece Pazarı Kutusu Aç • Çekilişlere Katıl</span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            Ücretsiz Bakiye ve Haftalık İndirim Fırsatları
          </h2>
          <p className="text-sm text-zinc-300 leading-relaxed max-w-2xl">
            Davet kodunla gelen her arkadaşın için <strong className="text-emerald-400">{cfg.inviteRewardInviter || 25} {currencyLabel}</strong>, arkadaşın ise <strong className="text-amber-300">{cfg.inviteRewardInvited || 15} {currencyLabel}</strong> bakiye kazanır. Ayrıca her hafta Fırsatlar menüsünden 3 gizemli Gece Pazarı kutusu açabilir ve Çekilişlere katılabilirsin.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row lg:flex-col gap-3">
          <AnimatedButton size="lg" variant="primary" onClick={() => navigate('/deals')}>
            <TrophyIcon className="w-4 h-4" />
            <span>Gece Pazarı Fırsatları</span>
          </AnimatedButton>
          <div className="grid grid-cols-2 gap-2">
            <AnimatedButton size="sm" variant="secondary" onClick={() => navigate('/giveaways')}>
              Çekilişler
            </AnimatedButton>
            {safeExternalUrl(cfg.discordInviteUrl) && (
              <a href={safeExternalUrl(cfg.discordInviteUrl)} target="_blank" rel="noopener noreferrer" className="w-full">
                <AnimatedButton size="sm" variant="secondary" className="w-full">
                  <DiscordBrandIcon className="w-4 h-4 text-indigo-400" />
                  <span>Discord</span>
                </AnimatedButton>
              </a>
            )}
          </div>
          <AnimatedButton size="sm" variant="ghost" onClick={() => navigate('/tickets')}>
            <ShieldAdminIcon className="w-4 h-4 text-amber-400" />
            <span>Site İçi Destek Talebi Aç</span>
          </AnimatedButton>
        </div>
      </section>

      {/* SEO FAQ ACCORDION */}
      <section className="space-y-6 pb-8">
        <div className="text-center max-w-2xl mx-auto space-y-2">
          <span className="text-xs font-mono uppercase tracking-[0.22em] text-amber-400">Sıkça Sorulan Sorular</span>
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">Merak Edilenler</h2>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {previewFaqs.map((item, idx) => {
            const isOpen = openFaq === idx;
            const panelId = `home-faq-${item.id}`;
            return (
              <div key={item.id} className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenFaq(isOpen ? -1 : idx)}
                  className="w-full px-5 py-4 flex items-center justify-between gap-4 text-left hover:bg-white/[0.02] transition"
                >
                  <span className="font-display font-bold text-sm sm:text-base text-white">{item.q}</span>
                  <span className="text-amber-400 font-mono text-lg shrink-0" aria-hidden="true">
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
                {isOpen && (
                  <div
                    id={panelId}
                    className="px-5 pb-4 text-xs sm:text-sm text-zinc-300 leading-relaxed border-t border-white/[0.05] pt-3"
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="text-center pt-2">
          <Link to="/sss">
            <AnimatedButton variant="secondary" size="sm">
              <span>Tüm Sık Sorulan Soruları Görüntüle ({FAQ_ITEMS.length} Konu)</span>
              <ArrowRightIcon className="w-4 h-4" />
            </AnimatedButton>
          </Link>
        </div>
      </section>
    </div>
  );
}
