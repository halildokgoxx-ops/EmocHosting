import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { apiRequest } from '../lib/api';
import { trackEvent } from '../lib/analytics';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { TrophyIcon } from '../components/icons/EmoIcons';

function remainingStr(endsAt) {
  const diff = Math.max(0, Number(endsAt || 0) - Date.now());
  if (diff <= 0) return 'Süre doldu — Çekiliş sonucu bekleniyor';
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${d}g ${h}sa ${m}dk kaldı`;
}

export function GiveawaysPage() {
  const { firebaseUser, currencyLabel } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [giveaways, setGiveaways] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiRequest('/api/deals/giveaways');
      setGiveaways(data.giveaways || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function joinGiveaway(id) {
    if (!firebaseUser) {
      toast.info('Çekilişe katılmak için giriş yapın.');
      navigate('/auth');
      return;
    }
    setBusyId(id);
    try {
      await apiRequest(`/api/deals/giveaways/${id}/join`, { method: 'POST' });
      trackEvent('giveaway_join', { giveawayId: id });
      toast.success('Çekilişe başarıyla katıldınız! Bol şans!');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId('');
    }
  }

  const active = giveaways.filter((g) => g.status === 'active');
  const drawn = giveaways.filter((g) => g.status === 'drawn');

  return (
    <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <SeoHead
        title="Çekilişler & Hediyeler"
        description="EmoçHosting ücretsiz sunucu, bakiye ve donanım çekilişlerine katılın. Şeffaf kriptografik seçim ve anında ödül teslimi."
      />

      <div className="glass-panel rounded-2xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 border-amber-500/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center">
            <TrophyIcon className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-black text-white">EmoçHosting Çekilişleri</h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Süre bittiğinde kazananlar otomatik ve şeffaf çekiliş sistemiyle seçilir, ödüller doğrudan hesabınıza tanımlanır.
            </p>
          </div>
        </div>
      </div>

      {/* Active Giveaways */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-white">Aktif Çekilişler ({active.length})</h2>
        {loading ? (
          <div className="glass-panel rounded-2xl h-44 animate-pulse" />
        ) : active.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center text-xs text-zinc-400">
            Şu anda aktif bir çekiliş bulunmuyor. Yeni çekilişler duyurulduğunda burada listelenir.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {active.map((g) => (
              <div key={g.id} className="glass-panel rounded-2xl p-6 flex flex-col justify-between gap-5 border-amber-500/25">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                      {g.prizeLabel || `${g.prizeValue} ${currencyLabel}`}
                    </span>
                    <span className="font-mono text-zinc-400">{remainingStr(g.endsAt)}</span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white">{g.title}</h3>
                  {g.description && <p className="text-xs text-zinc-400 leading-relaxed">{g.description}</p>}
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-400 pt-1">
                    <span>Katılımcı: <strong className="text-white">{g.participantCount || 0}</strong></span>
                    <span>Kazanan Sayısı: <strong className="text-amber-400">{g.winnerCount || 1} kişi</strong></span>
                    {g.minXp > 0 && <span>Min XP: <strong className="text-zinc-200">{g.minXp} XP</strong></span>}
                  </div>
                </div>

                {g.joined ? (
                  <AnimatedButton disabled variant="emerald" className="w-full">
                    Katılımınız Alındı ✓
                  </AnimatedButton>
                ) : (
                  <AnimatedButton
                    variant="primary"
                    loading={busyId === g.id}
                    onClick={() => joinGiveaway(g.id)}
                    className="w-full"
                  >
                    Tek Tıkla Çekilişe Katıl
                  </AnimatedButton>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Drawn / Completed Giveaways */}
      {drawn.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-xl font-bold text-white">Tamamlanan Çekilişler</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {drawn.map((g) => (
              <div key={g.id} className="glass-panel rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-white text-sm">{g.title}</span>
                  <span className="text-emerald-400 font-mono">{g.prizeLabel}</span>
                </div>
                {g.wonByMe ? (
                  <div className="px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-xs font-semibold text-amber-200">
                    🏆 Tebrikler! Bu çekilişi siz kazandınız — ödül detayları bildirim kutunuza iletildi.
                  </div>
                ) : (g.winnersNotifiedCount || 0) === 0 ? (
                  <div className="text-xs text-zinc-500">Katılımcı olmadığı için kazanan çıkmadı.</div>
                ) : (
                  <div className="px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/[0.06] text-xs text-zinc-400">
                    🎁 Çekiliş sonuçlandı ({g.winnersNotifiedCount} kazanan). Ödüller kazanan üyelere bildirim yoluyla iletildi.
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
