import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { GiftInviteIcon, TrophyIcon, WalletCoinIcon } from '../components/icons/EmoIcons';

export function LeaderboardInvitePage() {
  const { user, profileData, bootstrap, firebaseUser, refreshProfile, refreshBootstrap, currencyLabel } = useAuth();
  const toast = useToast();
  const [boardTab, setBoardTab] = useState('invites');
  const [claimCode, setClaimCode] = useState('');
  const [claiming, setClaiming] = useState(false);

  const cfg = bootstrap?.config || {};
  const lb = bootstrap?.leaderboard || { byInvites: [], byXp: [] };
  const list = boardTab === 'invites' ? lb.byInvites : lb.byXp;

  const inviteUrl = user?.referralCode
    ? `${window.location.origin}/auth?tab=register&ref=${user.referralCode}`
    : '';

  async function handleClaim(e) {
    e.preventDefault();
    if (!claimCode.trim()) return;
    setClaiming(true);
    try {
      const res = await apiRequest('/api/auth/claim-invite', { method: 'POST', body: { code: claimCode } });
      trackEvent('invite_claim');
      toast.success(res.message);
      setClaimCode('');
      await Promise.all([refreshProfile(), refreshBootstrap()]);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <SeoHead
        title="Davet Promosyonu & Liderlik Tablosu"
        description="Arkadaşlarını EmoçHosting'e davet et, her davette sen +25 İnvite arkadaşın +15 İnvite bakiye kazan ve XP liderlik sıralamasında zirveye çık."
      />

      {/* Invite Promo Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 glass-panel-luminous rounded-2xl p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
              <GiftInviteIcon className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-black text-white">Davet Promosyonu</h1>
              <p className="text-xs text-zinc-400">
                Her başarılı davette sen +{cfg.inviteRewardInviter || 25} {currencyLabel}, arkadaşın +{cfg.inviteRewardInvited || 15} {currencyLabel} kazanır!
              </p>
            </div>
          </div>

          {firebaseUser && user ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#09090b] border border-white/[0.08] space-y-2.5">
                <div className="text-xs text-zinc-400">Senin Özel Davet Kodun &amp; Bağlantın</div>
                <div className="flex flex-wrap gap-2">
                  <code className="flex-1 min-w-[200px] px-3 py-2 rounded-xl bg-zinc-950 border border-amber-500/30 text-amber-300 font-mono text-xs sm:text-sm truncate">
                    {inviteUrl}
                  </code>
                  <AnimatedButton
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                      toast.success('Davet bağlantısı kopyalandı!');
                    }}
                  >
                    Linki Kopyala
                  </AnimatedButton>
                  <AnimatedButton
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard.writeText(user.referralCode);
                      toast.success(`Kod kopyalandı: ${user.referralCode}`);
                    }}
                  >
                    {user.referralCode}
                  </AnimatedButton>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center tabular-nums">
                <div className="p-3.5 rounded-2xl bg-[#09090b] border border-white/[0.06]">
                  <div className="font-display text-2xl font-extrabold text-white">{user.referralCount || 0}</div>
                  <div className="text-[11px] text-zinc-400">Davet Sayısı</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#09090b] border border-white/[0.06]">
                  <div className="font-display text-2xl font-extrabold text-emerald-400">{user.referralEarnings || 0} {currencyLabel}</div>
                  <div className="text-[11px] text-zinc-400">Davet Kazancı</div>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#09090b] border border-white/[0.06]">
                  <div className="font-display text-2xl font-extrabold text-amber-400">{user.xp || 0} XP</div>
                  <div className="text-[11px] text-zinc-400">Liderlik Puanı</div>
                </div>
              </div>

              {!user.referredBy && (
                <form onSubmit={handleClaim} className="flex flex-col sm:flex-row gap-2 pt-1">
                  <label htmlFor="claim-invite-input" className="sr-only">Davet Kodu</label>
                  <input
                    id="claim-invite-input"
                    required
                    minLength={3}
                    maxLength={24}
                    value={claimCode}
                    onChange={(e) => setClaimCode(e.target.value.toUpperCase())}
                    placeholder="Bir arkadaşının davet kodunu gir (EMOC-...)"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-zinc-950 border border-white/10 text-sm font-mono text-white outline-none focus:border-amber-500/50"
                  />
                  <AnimatedButton type="submit" loading={claiming} variant="emerald">
                    Bonusu Al
                  </AnimatedButton>
                </form>
              )}
            </div>
          ) : (
            <div className="p-5 rounded-2xl bg-[#09090b] border border-white/[0.08] text-sm text-zinc-300">
              Davet kodunuzu görmek ve ödül kazanmak için giriş yapın veya kayıt olun.
            </div>
          )}
        </div>

        {/* Wallet & Transaction History */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-7 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <WalletCoinIcon className="w-6 h-6 text-amber-400" />
              <h3 className="font-display text-xl font-bold text-white">Cüzdan &amp; Hareketler</h3>
            </div>
            <span className="text-lg font-black text-emerald-400 font-mono tabular-nums">
              {Number(user?.balance || 0).toFixed(2)} {currencyLabel}
            </span>
          </div>
          <p className="text-xs text-zinc-400">
            {currencyLabel} bakiyeniz davet promosyonları, çekilişler ve platform etkinlikleriyle hesabınıza eklenir.
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
            {(profileData?.transactions || []).length === 0 ? (
              <div className="text-xs text-zinc-500 py-8 text-center">Henüz bakiye hareketi yok.</div>
            ) : (
              profileData.transactions.map((tx) => (
                <div key={tx.id} className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <div className="text-zinc-100 font-medium truncate">{tx.note}</div>
                    <div className="text-[10px] font-mono text-zinc-500">{new Date(tx.createdAt).toLocaleString('tr-TR')}</div>
                  </div>
                  <span className={`font-mono font-bold shrink-0 ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} {currencyLabel}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="glass-panel rounded-2xl p-6 sm:p-7 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <TrophyIcon className="w-7 h-7 text-amber-400" />
            <div>
              <h2 className="font-display text-2xl font-extrabold text-white">EmoçHosting Liderlik Tablosu</h2>
              <p className="text-xs text-zinc-400">Gerçek zamanlı kullanıcı davet ve XP sıralaması</p>
            </div>
          </div>

          <div className="inline-flex p-1 rounded-xl bg-zinc-900 border border-white/[0.08] text-xs font-bold">
            <button
              onClick={() => setBoardTab('invites')}
              className={`px-4 py-2 rounded-lg transition ${boardTab === 'invites' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              En Çok Davet Edenler
            </button>
            <button
              onClick={() => setBoardTab('xp')}
              className={`px-4 py-2 rounded-lg transition ${boardTab === 'xp' ? 'bg-amber-500 text-zinc-950' : 'text-zinc-400 hover:text-white'}`}
            >
              En Yüksek XP
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-xs uppercase text-zinc-500">
                <th className="py-3 px-3">Sıra</th>
                <th className="py-3 px-3">Kullanıcı</th>
                <th className="py-3 px-3">Rozetler</th>
                <th className="py-3 px-3">Davet</th>
                <th className="py-3 px-3">XP Puanı</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05] tabular-nums">
              {list.map((row) => (
                <tr key={row.rank ?? `${boardTab}-${row.displayName}`} className="hover:bg-white/[0.03] transition">
                  <td className="py-3.5 px-3 font-display font-black">
                    {row.rank === 1 ? '🥇 #1' : row.rank === 2 ? '🥈 #2' : row.rank === 3 ? '🥉 #3' : `#${row.rank}`}
                  </td>
                  <td className="py-3.5 px-3 font-semibold text-white">{row.displayName}</td>
                  <td className="py-3.5 px-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.badges || []).map((b) => (
                        <span key={b} className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25 text-[10px] font-bold">
                          {b}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono text-emerald-400">{row.referralCount}</td>
                  <td className="py-3.5 px-3 font-mono text-amber-300">{row.xp} XP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
