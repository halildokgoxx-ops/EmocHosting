import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { safeExternalUrl } from '../../lib/api';
import { EmoLogo } from '../icons/EmoLogo';
import { DiscordBrandIcon } from '../icons/EmoIcons';

export function Footer() {
  const { bootstrap } = useAuth();
  const cfg = bootstrap?.config || {};

  return (
    <footer className="relative z-10 border-t border-white/[0.07] bg-[#0c0d11]/95 mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="md:col-span-2 space-y-4">
          <EmoLogo size={34} subtitle />
          <p className="text-sm text-zinc-400 max-w-md leading-relaxed">
            {cfg.siteTagline || 'Minecraft, Discord Bot, Website ve Özel Altyapılar için gerçek donanım performansı sunan yeni nesil hosting platformu.'}
          </p>
          {safeExternalUrl(cfg.discordInviteUrl) && (
            <a
              href={safeExternalUrl(cfg.discordInviteUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-200 text-xs font-semibold hover:border-amber-400/40 transition"
            >
              <DiscordBrandIcon className="w-4 h-4 text-indigo-400" />
              <span>Resmi Discord Topluluğuna Katıl</span>
            </a>
          )}
        </div>

        <div>
          <h2 className="font-display font-bold text-white mb-3 text-sm">Platform</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li><Link to="/packages" className="hover:text-amber-300 transition">Mağaza &amp; Paketler</Link></li>
            <li><Link to="/deals" className="hover:text-amber-300 transition">Gece Pazarı (Fırsatlar)</Link></li>
            <li><Link to="/giveaways" className="hover:text-amber-300 transition">Çekilişler</Link></li>
            <li><Link to="/sss" className="hover:text-amber-300 transition">Sıkça Sorulan Sorular (SSS)</Link></li>
            <li><Link to="/leaderboard" className="hover:text-amber-300 transition">Davet &amp; Liderlik</Link></li>
            <li><Link to="/status" className="hover:text-amber-300 transition">Sistem Durumu</Link></li>
            <li><Link to="/servers" className="hover:text-amber-300 transition">Hizmetlerim</Link></li>
            <li><Link to="/tickets" className="hover:text-amber-300 transition">Destek Talepleri</Link></li>
          </ul>
        </div>

        <div>
          <h2 className="font-display font-bold text-white mb-3 text-sm">Yasal &amp; İletişim</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <Link to="/kullanim-sartlari" className="hover:text-amber-300 transition">
                Hizmet Kullanım Şartları (ToS)
              </Link>
            </li>
            <li>
              <Link to="/gizlilik-politikasi" className="hover:text-amber-300 transition">
                Gizlilik Politikası &amp; KVKK
              </Link>
            </li>
            <li>
              <Link to="/cerez-politikasi" className="hover:text-amber-300 transition">
                Çerez Politikası
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('emoc:open-cookie-settings'))}
                className="hover:text-amber-300 transition text-left"
              >
                Çerez Tercihlerini Yönet
              </button>
            </li>
            {bootstrap?.latestChangelog && (
              <li>
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('emoc:open-changelog'))}
                  className="hover:text-amber-300 transition text-left"
                >
                  Sürüm Notları ({bootstrap.latestChangelog.version})
                </button>
              </li>
            )}
            <li className="text-xs text-zinc-400 pt-1">
              Destek:{' '}
              <a
                href={`mailto:${cfg.supportEmail || 'destek@emochosting.com'}`}
                className="text-zinc-300 hover:text-amber-300 underline"
              >
                {cfg.supportEmail || 'destek@emochosting.com'}
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/[0.06] py-4 px-4 text-center text-xs text-zinc-400">
        {cfg.footerNote || `© ${new Date().getFullYear()} ${cfg.siteName || 'EmoçHosting'} — Tüm hakları saklıdır.`}
      </div>
    </footer>
  );
}
