import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { FAQ_CATEGORIES, FAQ_ITEMS, buildFaqJsonLd } from '../data/faqData';
import { SearchGlassIcon, ArrowRightIcon, TicketSupportIcon } from '../components/icons/EmoIcons';

export function FaqPage() {
  const [cat, setCat] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(FAQ_ITEMS[0]?.id || '');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FAQ_ITEMS.filter((item) => {
      if (cat !== 'all' && item.cat !== cat) return false;
      if (!q) return true;
      return item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q);
    });
  }, [cat, query]);

  const schema = useMemo(() => buildFaqJsonLd(FAQ_ITEMS), []);

  return (
    <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <SeoHead
        title="Sıkça Sorulan Sorular (SSS)"
        description="EmoçHosting Minecraft, Discord Bot, Website barındırma, SFTP erişimi, otomatik domain, Gece Pazarı ve KVKK hakları hakkında tüm soruların yanıtları."
        structuredData={schema}
      />

      <div className="glass-panel-luminous rounded-2xl p-6 sm:p-8 space-y-4">
        <span className="text-xs font-mono uppercase tracking-[0.22em] text-amber-400">Yardım Merkezi &amp; SSS</span>
        <h1 className="font-display text-3xl sm:text-4xl font-black text-white">Sıkça Sorulan Sorular</h1>
        <p className="text-sm text-zinc-300 max-w-2xl leading-relaxed">
          Sunucu kurulumu, Minecraft mod/eklenti yönetimi, SFTP bağlantısı, paket yükseltme ve gizlilik haklarınızla ilgili merak edilenler.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <div className="relative flex-1">
            <label htmlFor="faq-search-input" className="sr-only">Soru ara</label>
            <SearchGlassIcon className="w-4 h-4 text-zinc-400 absolute left-3.5 top-3" />
            <input
              id="faq-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Soru ara (örn: SFTP, Modrinth, domain, yedek)..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-sm text-white placeholder:text-zinc-500"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1" role="tablist" aria-label="SSS Kategorileri">
          {FAQ_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={cat === c.id}
              onClick={() => setCat(c.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
                cat === c.id
                  ? 'bg-amber-500 text-zinc-950 border-amber-400'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center text-sm text-zinc-400">
            Aramanızla eşleşen soru bulunamadı.
          </div>
        ) : (
          filtered.map((item) => {
            const isOpen = openId === item.id;
            const panelId = `faq-panel-${item.id}`;
            return (
              <div key={item.id} className="glass-panel rounded-2xl border border-white/[0.08] overflow-hidden">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => setOpenId(isOpen ? '' : item.id)}
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
                    className="px-5 pb-4 pt-3 text-xs sm:text-sm text-zinc-300 leading-relaxed border-t border-white/[0.06]"
                  >
                    {item.a}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-amber-500/25">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-white">Hemen Sunucunuzu Kurmaya Hazır mısınız?</h2>
          <p className="text-xs sm:text-sm text-zinc-300">
            Destek ekibimizden yardım alın veya mağazadaki paketleri inceleyip saniyeler içinde başlayın.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5 shrink-0">
          <Link to="/packages">
            <AnimatedButton variant="primary" size="md">
              <span>Paketleri İncele</span>
              <ArrowRightIcon className="w-4 h-4" />
            </AnimatedButton>
          </Link>
          <Link to="/tickets">
            <AnimatedButton variant="secondary" size="md">
              <TicketSupportIcon className="w-4 h-4 text-amber-400" />
              <span>Destek Talebi</span>
            </AnimatedButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
