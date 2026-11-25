import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { ShieldAdminIcon } from '../components/icons/EmoIcons';
import { FALLBACK_TOS_TEXT, FALLBACK_KVKK_TEXT } from '../data/legalTexts';

const COOKIE_ROWS = [
  {
    name: 'Oturum ve Güvenlik Çerezleri',
    purpose: 'Hesap oturumu, güvenlik doğrulaması ve panel gezinmesi için gereklidir.',
    duration: 'Oturum / 30 gün',
    required: true,
  },
  {
    name: 'emoc_cookie_consent / emoc_cookie_prefs',
    purpose: 'Çerez ve gizlilik onay tercihinizi hatırlamak amacıyla saklanır.',
    duration: '1 yıl',
    required: true,
  },
  {
    name: 'Performans & Anonim Analitik (Opsiyonel)',
    purpose: 'Hangi sayfa ve paket kategorilerinin daha fazla ilgi gördüğünü anonimleştirilmiş olaylarla ölçerek hız ve arayüz deneyimini iyileştirir. Açık rızanız olmadan etkinleşmez.',
    duration: 'Tercih değiştirene kadar',
    required: false,
  },
];

const MODE_META = {
  privacy: {
    title: 'Gizlilik Politikası & KVKK Aydınlatma Metni',
    description:
      'EmoçHosting 6698 sayılı KVKK aydınlatma metni, kişisel veri işleme amaçları, saklama güvenliği ve veri taşınabilirliği haklarınız.',
    badge: '6698 Sayılı KVKK',
    heading: 'Gizlilik Politikası ve KVKK Aydınlatma Metni',
  },
  terms: {
    title: 'Hizmet Kullanım Şartları (ToS)',
    description:
      'EmoçHosting Minecraft, Web, Discord Bot ve Altyapı barındırma hizmetleri için Kullanıcı Sözleşmesi ve Kabul Edilebilir Kullanım Politikası.',
    badge: 'Kullanıcı Sözleşmesi v3.0',
    heading: 'Hizmet Kullanım Şartları (ToS)',
  },
  cookies: {
    title: 'Çerez Politikası & Tercih Yönetimi',
    description:
      'EmoçHosting üzerinde kullanılan zorunlu güvenlik çerezleri ve rızaya bağlı anonim analitik çerez tercihleri hakkında bilgilendirme.',
    badge: 'Çerez Bilgilendirmesi',
    heading: 'Çerez Politikası',
  },
};

export function LegalPage({ mode = 'privacy' }) {
  const { bootstrap } = useAuth();
  const cfg = bootstrap?.config || {};
  const meta = MODE_META[mode] || MODE_META.privacy;

  return (
    <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      <SeoHead title={meta.title} description={meta.description} />

      <div className="glass-panel-luminous rounded-2xl p-6 sm:p-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold">
            <ShieldAdminIcon className="w-4 h-4" />
            <span>{meta.badge}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <Link
              to="/gizlilik-politikasi"
              className={`px-3 py-1.5 rounded-lg border transition ${
                mode === 'privacy'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
              }`}
            >
              Gizlilik &amp; KVKK
            </Link>
            <Link
              to="/kullanim-sartlari"
              className={`px-3 py-1.5 rounded-lg border transition ${
                mode === 'terms'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
              }`}
            >
              Kullanım Şartları
            </Link>
            <Link
              to="/cerez-politikasi"
              className={`px-3 py-1.5 rounded-lg border transition ${
                mode === 'cookies'
                  ? 'bg-amber-500 text-zinc-950 border-amber-400 font-bold'
                  : 'bg-zinc-900 border-white/10 text-zinc-300 hover:text-white'
              }`}
            >
              Çerez Politikası
            </Link>
          </div>
        </div>

        <h1 className="font-display text-2xl sm:text-4xl font-black text-white">{meta.heading}</h1>
        <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">{meta.description}</p>
      </div>

      {mode === 'cookies' ? (
        <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
          <p className="text-sm text-zinc-300 leading-relaxed">
            EmoçHosting yalnızca platform güvenliği, kullanıcı oturumu ve açık rızanız halinde anonim performans ölçümü için sınırlı sayıda çerez ve yerel depolama anahtarı kullanır. Üçüncü taraf reklam veya çapraz site izleme çerezi kullanılmaz.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-zinc-400 uppercase text-[11px]">
                  <th className="py-3 pr-4">Çerez / Anahtar</th>
                  <th className="py-3 pr-4">Kullanım Amacı</th>
                  <th className="py-3 pr-4">Süre</th>
                  <th className="py-3">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {COOKIE_ROWS.map((row) => (
                  <tr key={row.name}>
                    <td className="py-3.5 pr-4 font-semibold text-white">{row.name}</td>
                    <td className="py-3.5 pr-4 text-zinc-300">{row.purpose}</td>
                    <td className="py-3.5 pr-4 font-mono text-zinc-400 whitespace-nowrap">{row.duration}</td>
                    <td className="py-3.5 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          row.required
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {row.required ? 'Zorunlu' : 'İsteğe Bağlı'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-white/[0.08]">
            <p className="text-xs text-zinc-400">
              Çerez rızanızı dilediğiniz zaman tek tıkla güncelleyebilir veya iptal edebilirsiniz.
            </p>
            <AnimatedButton
              variant="primary"
              size="sm"
              onClick={() => window.dispatchEvent(new Event('emoc:open-cookie-settings'))}
            >
              Çerez Tercihlerini Yönet
            </AnimatedButton>
          </div>
        </div>
      ) : (
        <article className="glass-panel rounded-2xl p-6 sm:p-8 text-xs sm:text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
          {mode === 'terms'
            ? cfg.tosText || FALLBACK_TOS_TEXT
            : cfg.privacyText || FALLBACK_KVKK_TEXT}
        </article>
      )}

      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs text-zinc-300">
          Sorularınız mı var? <Link to="/sss" className="text-amber-400 underline hover:text-amber-300">Sık Sorulan Sorular</Link> sayfasını inceleyebilir veya hesap açıp sunucunuzu hemen kurabilirsiniz.
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/packages">
            <AnimatedButton size="sm" variant="primary">Paketleri İncele</AnimatedButton>
          </Link>
          <Link to="/tickets">
            <AnimatedButton size="sm" variant="secondary">Destek Talebi Aç</AnimatedButton>
          </Link>
        </div>
      </div>
    </div>
  );
}
