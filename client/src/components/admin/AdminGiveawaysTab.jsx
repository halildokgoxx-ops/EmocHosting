import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrophyIcon, TrashIcon, PlusIcon, GiftInviteIcon, PlayersGroupIcon } from '../icons/EmoIcons';

export function AdminGiveawaysTab({ invites = [], users = [], leaderboard, config = {}, onRefresh }) {
  const toast = useToast();
  const [giveaways, setGiveaways] = useState([]);
  const [creating, setCreating] = useState(false);
  const [participantsMap, setParticipantsMap] = useState({});
  const [openParticipantsId, setOpenParticipantsId] = useState('');

  const [newGiveaway, setNewGiveaway] = useState({
    title: '',
    description: '',
    prizeType: 'balance',
    prizeValue: 100,
    winnerCount: 1,
    durationHours: 48,
    minXp: 0,
  });

  const [inviteCfg, setInviteCfg] = useState({
    inviteRewardInviter: config?.inviteRewardInviter ?? 25,
    inviteRewardInvited: config?.inviteRewardInvited ?? 15,
    invitePromoActive: config?.invitePromoActive !== false,
  });

  const [leaderBonusAmount, setLeaderBonusAmount] = useState(50);

  async function loadGiveaways() {
    try {
      const d = await apiRequest(`${ADMIN_API_PREFIX}/giveaways`);
      setGiveaways(d.giveaways || []);
    } catch {}
  }

  useEffect(() => {
    loadGiveaways();
  }, []);

  useEffect(() => {
    setInviteCfg({
      inviteRewardInviter: config?.inviteRewardInviter ?? 25,
      inviteRewardInvited: config?.inviteRewardInvited ?? 15,
      invitePromoActive: config?.invitePromoActive !== false,
    });
  }, [config]);

  async function createGiveaway(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/giveaways`, { method: 'POST', body: newGiveaway });
      toast.success('Yeni çekiliş oluşturuldu ve kullanıcılara bildirim gönderildi!');
      setNewGiveaway({ title: '', description: '', prizeType: 'balance', prizeValue: 100, winnerCount: 1, durationHours: 48, minXp: 0 });
      await loadGiveaways();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function drawGiveaway(id) {
    if (!window.confirm('Çekiliş kriptografik olarak çekilsin ve ödüller kazananlara teslim edilsin mi?')) return;
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/giveaways/${id}/draw`, { method: 'POST' });
      toast.success(`Çekiliş tamamlandı! Kazanan sayısı: ${res.winners?.length || 0}`);
      await loadGiveaways();
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function extendGiveaway(id, hours = 24) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/giveaways/${id}`, { method: 'PATCH', body: { extendHours: hours } });
      toast.success(`Çekiliş süresi +${hours} saat uzatıldı`);
      await loadGiveaways();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function toggleParticipants(id) {
    if (openParticipantsId === id) {
      setOpenParticipantsId('');
      return;
    }
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/giveaways/${id}/participants`);
      setParticipantsMap((p) => ({ ...p, [id]: res.participants || [] }));
      setOpenParticipantsId(id);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteGiveaway(id) {
    if (!window.confirm('Bu çekilişi silmek istediğinize emin misiniz?')) return;
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/giveaways/${id}`, { method: 'DELETE' });
      setGiveaways((p) => p.filter((x) => x.id !== id));
      toast.info('Çekiliş silindi');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveInviteConfig() {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/config`, { method: 'PATCH', body: inviteCfg });
      toast.success('Davet ödül oranları kaydedildi!');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function rewardLeader(uid, displayName) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/leaderboard/reward`, {
        method: 'POST',
        body: { uid, bonusBalance: Number(leaderBonusAmount || 50), badge: 'Liderlik Şampiyonu' },
      });
      toast.success(`${displayName} +${leaderBonusAmount} İnvite ve Şampiyon rozeti ile ödüllendirildi!`);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const activeGiveaways = giveaways.filter((g) => g.status === 'active');
  const drawnGiveaways = giveaways.filter((g) => g.status === 'drawn');
  const totalParticipants = giveaways.reduce((acc, g) => acc + Number(g.participantCount || 0), 0);

  const topInviteCandidates = (users && users.length > 0
    ? [...users]
        .filter((u) => !u.banned)
        .sort((a, b) => Number(b.referralCount || 0) - Number(a.referralCount || 0) || Number(b.xp || 0) - Number(a.xp || 0))
        .slice(0, 8)
        .map((u, idx) => ({ ...u, rank: idx + 1 }))
    : (leaderboard?.byInvites || []).slice(0, 8));

  return (
    <div className="space-y-6 text-xs">
      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">AKTİF ÇEKİLİŞ</div>
          <div className="font-display text-2xl font-black text-emerald-400 mt-1">{activeGiveaways.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">SONUÇLANAN</div>
          <div className="font-display text-2xl font-black text-amber-400 mt-1">{drawnGiveaways.length}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM KATILIM</div>
          <div className="font-display text-2xl font-black text-white mt-1">{totalParticipants}</div>
        </div>
        <div className="glass-panel rounded-2xl p-4">
          <div className="text-[11px] font-mono text-zinc-400">TOPLAM DAVET</div>
          <div className="font-display text-2xl font-black text-sky-400 mt-1">{invites.length}</div>
        </div>
      </div>

      {/* Create Giveaway */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <TrophyIcon className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-xl font-bold text-white">Yeni Çekiliş Başlat</h3>
        </div>
        <form onSubmit={createGiveaway} className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          <div className="col-span-2">
            <label className="text-[10px] text-zinc-400 block mb-1">Çekiliş Başlığı</label>
            <input required value={newGiveaway.title} onChange={(e) => setNewGiveaway({ ...newGiveaway, title: e.target.value })} placeholder="Örn: 500 İnvite Dev Çekiliş" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Ödül Tipi</label>
            <select value={newGiveaway.prizeType} onChange={(e) => setNewGiveaway({ ...newGiveaway, prizeType: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="balance">Bakiye (İnvite)</option>
              <option value="coupon">İndirim Kuponu (%)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Ödül Değeri</label>
            <input type="number" min={1} value={newGiveaway.prizeValue} onChange={(e) => setNewGiveaway({ ...newGiveaway, prizeValue: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Kazanan Sayısı</label>
            <input type="number" min={1} max={50} value={newGiveaway.winnerCount} onChange={(e) => setNewGiveaway({ ...newGiveaway, winnerCount: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Süre (Saat)</label>
            <input type="number" min={1} max={720} value={newGiveaway.durationHours} onChange={(e) => setNewGiveaway({ ...newGiveaway, durationHours: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div>
            <label className="text-[10px] text-zinc-400 block mb-1">Min XP Şartı</label>
            <input type="number" min={0} value={newGiveaway.minXp} onChange={(e) => setNewGiveaway({ ...newGiveaway, minXp: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="col-span-2 sm:col-span-3 lg:col-span-4">
            <label className="text-[10px] text-zinc-400 block mb-1">Açıklama (İsteğe bağlı)</label>
            <input value={newGiveaway.description} onChange={(e) => setNewGiveaway({ ...newGiveaway, description: e.target.value })} placeholder="Katılım şartları veya detaylar..." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>
          <div className="flex items-end justify-end">
            <AnimatedButton type="submit" size="sm" loading={creating} className="w-full">
              <PlusIcon className="w-4 h-4" /> Başlat
            </AnimatedButton>
          </div>
        </form>
      </div>

      {/* Giveaways Grid */}
      <div className="glass-panel rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">Tüm Çekilişler ({giveaways.length})</h3>
          <AnimatedButton size="xs" variant="secondary" onClick={loadGiveaways}>Yenile</AnimatedButton>
        </div>

        {giveaways.length === 0 ? (
          <div className="py-8 text-center text-zinc-500">Henüz oluşturulmuş çekiliş bulunmuyor.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {giveaways.map((g) => {
              const pList = participantsMap[g.id] || [];
              const showingParticipants = openParticipantsId === g.id;
              return (
                <div key={g.id} className="p-4 rounded-2xl bg-zinc-950/70 border border-white/10 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{g.title}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${g.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-zinc-300'}`}>
                          {g.status === 'active' ? 'AKTİF' : 'SONUÇLANDI'}
                        </span>
                      </div>
                      <div className="text-zinc-400 mt-1">
                        Ödül: <strong className="text-amber-300">{g.prizeLabel}</strong> • {g.winnerCount} kazanan • {g.participantCount || 0} katılımcı
                        {Number(g.minXp || 0) > 0 ? ` • Min ${g.minXp} XP` : ''}
                      </div>
                      {g.endsAt && (
                        <div className="text-[11px] font-mono text-zinc-500 mt-0.5">
                          Bitiş: {new Date(g.endsAt).toLocaleString('tr-TR')}
                        </div>
                      )}
                    </div>

                    <button type="button" onClick={() => deleteGiveaway(g.id)} className="text-rose-400 hover:bg-rose-500/15 p-1.5 rounded-lg shrink-0" title="Çekilişi Sil">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <AnimatedButton size="xs" variant="secondary" onClick={() => toggleParticipants(g.id)}>
                      <PlayersGroupIcon className="w-3.5 h-3.5" />
                      {showingParticipants ? 'Katılımcıları Gizle' : `Katılımcılar (${g.participantCount || 0})`}
                    </AnimatedButton>
                    {g.status === 'active' && (
                      <>
                        <AnimatedButton size="xs" variant="ghost" onClick={() => extendGiveaway(g.id, 24)}>
                          +24 Saat Uzat
                        </AnimatedButton>
                        <AnimatedButton size="xs" variant="primary" onClick={() => drawGiveaway(g.id)}>
                          Şimdi Çek &amp; Dağıt
                        </AnimatedButton>
                      </>
                    )}
                  </div>

                  {showingParticipants && (
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5 max-h-40 overflow-y-auto">
                      {pList.length === 0 ? (
                        <div className="text-zinc-500 text-center py-2">Henüz katılımcı yok.</div>
                      ) : (
                        pList.map((p) => (
                          <div key={p.uid} className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white/[0.03]">
                            <span className="text-zinc-200 truncate">{p.displayName} ({p.email || p.uid})</span>
                            <span className="text-amber-300 font-mono shrink-0">{p.xp || 0} XP</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {g.status === 'drawn' && Array.isArray(g.winners) && g.winners.length > 0 && (
                    <div className="pt-2 border-t border-white/10 space-y-1">
                      <div className="text-[11px] font-semibold text-amber-300">Kazananlar (Ödül &amp; Bildirim İletildi):</div>
                      {g.winners.map((w, idx) => (
                        <div key={idx} className="flex items-center justify-between text-[11px] bg-black/30 rounded-lg px-2.5 py-1.5">
                          <span className="text-white truncate">🏆 {w.displayName} ({w.email || w.uid})</span>
                          <span className="text-emerald-400 font-mono shrink-0 ml-2">{w.rewardNote}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invite Promo Rates & Leaderboard Rewarder */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <GiftInviteIcon className="w-5 h-5 text-emerald-400" />
            <h3 className="font-display text-lg font-bold text-white">Davet (Referans) Ödül Oranları</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 block mb-1">Davet Eden Ödülü (İnvite)</label>
              <input type="number" min={0} value={inviteCfg.inviteRewardInviter} onChange={(e) => setInviteCfg({ ...inviteCfg, inviteRewardInviter: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Davet Edilen Bonusu (İnvite)</label>
              <input type="number" min={0} value={inviteCfg.inviteRewardInvited} onChange={(e) => setInviteCfg({ ...inviteCfg, inviteRewardInvited: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>
          <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 cursor-pointer">
            <input type="checkbox" checked={inviteCfg.invitePromoActive} onChange={(e) => setInviteCfg({ ...inviteCfg, invitePromoActive: e.target.checked })} className="accent-amber-500" />
            <span>Davet Promosyonu Aktif</span>
          </label>
          <AnimatedButton size="sm" variant="emerald" onClick={saveInviteConfig}>Davet Ayarlarını Kaydet</AnimatedButton>
        </div>

        <div className="glass-panel rounded-3xl p-6 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-400" />
              <h3 className="font-display text-lg font-bold text-white">Liderlik Tablosu Ödül Dağıtıcı</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-zinc-400">Ödül:</span>
              <input
                type="number"
                min={1}
                value={leaderBonusAmount}
                onChange={(e) => setLeaderBonusAmount(Number(e.target.value))}
                className="w-20 px-2 py-1 rounded-lg bg-zinc-950 border border-white/15 text-amber-300 font-mono"
              />
              <span className="text-zinc-400">İnvite</span>
            </div>
          </div>
          <div className="space-y-2 max-h-56 overflow-y-auto">
            {topInviteCandidates.map((u) => (
              <div key={u.uid || u.rank} className="p-2.5 rounded-xl bg-white/5 flex items-center justify-between gap-2">
                <span className="truncate">#{u.rank} <strong>{u.displayName}</strong> ({u.referralCount || 0} davet • {u.xp || 0} XP)</span>
                {u.uid && (
                  <AnimatedButton size="xs" variant="primary" onClick={() => rewardLeader(u.uid, u.displayName)}>
                    +{leaderBonusAmount} İnvite Ver
                  </AnimatedButton>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
