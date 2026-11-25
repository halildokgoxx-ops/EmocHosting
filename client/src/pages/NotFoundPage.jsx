import React from 'react';
import { Link } from 'react-router-dom';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { ArrowRightIcon } from '../components/icons/EmoIcons';

export function NotFoundPage() {
  return (
    <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center space-y-8">
      <SeoHead
        title="404 — Sayfa Bulunamadı"
        description="Aradığınız sayfa EmoçHosting üzerinde bulunamadı veya taşınmış olabilir."
        noIndex
      />

      <div className="glass-panel-luminous rounded-3xl p-8 sm:p-12 space-y-6">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono font-bold">
          HTTP 404 • SAYFA BULUNAMADI
        </div>

        <div className="font-display text-7xl sm:text-8xl font-black text-gradient-cyber tracking-tight">
          404
        </div>

        <div className="space-y-2 max-w-lg mx-auto">
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
            Bu Adreste Bir Düğüm Bulunamadı
          </h1>
          <p className="text-sm text-zinc-300 leading-relaxed">
            Bağlantı hatalı yazılmış, kaldırılmış veya yalnızca yetkili hesaplara açık olabilir. Aşağıdaki hızlı bağlantılarla devam edebilirsiniz.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link to="/">
            <AnimatedButton size="lg" variant="primary">
              <span>Ana Sayfaya Dön</span>
              <ArrowRightIcon className="w-4 h-4" />
            </AnimatedButton>
          </Link>
          <Link to="/packages">
            <AnimatedButton size="lg" variant="secondary">
              <span>Mağaza &amp; Paketler</span>
            </AnimatedButton>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-white/[0.08] text-xs">
          <Link to="/deals" className="p-3 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-amber-400/40 text-zinc-200 font-medium transition">
            Gece Pazarı
          </Link>
          <Link to="/giveaways" className="p-3 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-amber-400/40 text-zinc-200 font-medium transition">
            Çekilişler
          </Link>
          <Link to="/sss" className="p-3 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-amber-400/40 text-zinc-200 font-medium transition">
            Sık Sorulan Sorular
          </Link>
          <Link to="/status" className="p-3 rounded-xl bg-zinc-900/90 border border-white/10 hover:border-amber-400/40 text-zinc-200 font-medium transition">
            Sistem Durumu
          </Link>
        </div>
      </div>
    </div>
  );
}
