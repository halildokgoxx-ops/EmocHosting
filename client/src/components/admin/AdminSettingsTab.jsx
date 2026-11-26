import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { SettingsGearIcon, MegaphoneIcon, ShieldAdminIcon, WalletCoinIcon, TrashIcon, PlusIcon } from '../icons/EmoIcons';

export function AdminSettingsTab({ config = {}, isOwner, onRefresh }) {
  const toast = useToast();
  const { currencyLabel } = useAuth();
  const [cfg, setCfg] = useState(config || {});
  const [section, setSection] = useState('pricing');
  const [saving, setSaving] = useState(false);

  const [announcements, setAnnouncements] = useState([]);
  const [newAnn, setNewAnn] = useState({ title: '', message: '', type: 'info' });

  useEffect(() => {
    setCfg(config || {});
  }, [config]);

  useEffect(() => {
    if (section === 'general') {
      apiRequest(`${ADMIN_API_PREFIX}/announcements`).then((d) => setAnnouncements(d.items || [])).catch(() => {});
    }
  }, [section]);

  const activeCurrency = cfg.currencyLabel !== undefined ? cfg.currencyLabel : currencyLabel;

  async function saveConfig() {
    setSaving(true);
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/config`, { method: 'PATCH', body: cfg });
      toast.success('Platform ayarları kaydedildi ve anında yayınlandı!');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function testWebhook() {
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/webhook/test`, { method: 'POST' });
      if (res.sent) toast.success('Discord Webhook testi başarıyla gönderildi!');
      else toast.error(res.reason || 'Webhook gönderilemedi');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addAnnouncement(e) {
    e.preventDefault();
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/announcements`, { method: 'POST', body: newAnn });
      toast.success('Duyuru eklendi');
      setNewAnn({ title: '', message: '', type: 'info' });
      const d = await apiRequest(`${ADMIN_API_PREFIX}/announcements`);
      setAnnouncements(d.items || []);
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteAnnouncement(id) {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/announcements/${id}`, { method: 'DELETE' });
      setAnnouncements((p) => p.filter((x) => x.id !== id));
      toast.info('Duyuru kaldırıldı');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const tabs = [
    { id: 'pricing', label: 'Fiyatlandırma & Para Birimi' },
    { id: 'general', label: 'Genel, Görünüm & Duyurular' },
    { id: 'security', label: 'Kayıt, İzinler & Yasal Metin' },
    { id: 'quotas', label: 'Kotalar, Watchdog & Bildirim' },
    { id: 'seo', label: 'SEO & OpenGraph' },
  ];

  return (
    <div className="space-y-6 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSection(t.id)}
              className={`px-3.5 py-2 rounded-xl font-bold border transition ${
                section === t.id ? 'bg-amber-500/20 border-amber-500/45 text-amber-200' : 'bg-white/5 border-white/10 text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <AnimatedButton size="sm" variant="emerald" loading={saving} onClick={saveConfig}>
          <SettingsGearIcon className="w-4 h-4" /> Ayarları Kaydet
        </AnimatedButton>
      </div>

      {section === 'pricing' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-2.5">
            <WalletCoinIcon className="w-5 h-5 text-amber-400" />
            <div>
              <h4 className="font-display text-lg font-bold text-white">Fiyatlandırma &amp; Bakiye Birimi Ayarları</h4>
              <p className="text-zinc-400">Platformdaki tüm paket fiyatlarında, cüzdanda ve kuponlarda kullanılacak para/kredi birimini serbestçe belirleyin.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label className="text-zinc-300 font-semibold block mb-1">
                Para / Bakiye Birimi Adı (Serbest Yazı)
              </label>
              <input
                value={cfg.currencyLabel ?? 'İnvite'}
                onChange={(e) => setCfg({ ...cfg, currencyLabel: e.target.value })}
                placeholder="Örn: İnvite, TL, Kredi, ₺, Puan"
                maxLength={24}
                className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-amber-500/35 focus:border-amber-400 outline-none text-amber-200 font-bold"
              />
              <p className="text-[11px] text-zinc-500 mt-1">
                Sabit seçenek yoktur — ne yazarsanız mağaza, cüzdan ve admin panelinde tüm birimler otomatik güncellenir (Örn: TL, Kredi, İnvite).
              </p>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Varsayılan Faturalandırma Periyodu</label>
              <select
                value={cfg.defaultBillingCycle || 'monthly'}
                onChange={(e) => setCfg({ ...cfg, defaultBillingCycle: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/15 text-white"
              >
                <option value="daily">Günlük</option>
                <option value="weekly">Haftalık</option>
                <option value="monthly">Aylık</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Vergi / İşlem Payı (% 0–50)</label>
              <input
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={cfg.taxRatePct ?? 0}
                onChange={(e) => setCfg({ ...cfg, taxRatePct: Number(e.target.value) })}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Yeni Üye Başlangıç Bakiyesi ({activeCurrency})</label>
              <input
                type="number"
                min={0}
                value={cfg.defaultStartingBalance ?? 0}
                onChange={(e) => setCfg({ ...cfg, defaultStartingBalance: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Davet Eden Ödülü ({activeCurrency})</label>
              <input
                type="number"
                min={0}
                value={cfg.inviteRewardInviter ?? 25}
                onChange={(e) => setCfg({ ...cfg, inviteRewardInviter: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Davet Edilen Bonusu ({activeCurrency})</label>
              <input
                type="number"
                min={0}
                value={cfg.inviteRewardInvited ?? 15}
                onChange={(e) => setCfg({ ...cfg, inviteRewardInvited: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Süre Dolumu Tolerans Süresi (Saat)</label>
              <input
                type="number"
                min={0}
                max={168}
                value={cfg.renewalGraceHours ?? 0}
                onChange={(e) => setCfg({ ...cfg, renewalGraceHours: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Site Geneli Flash İndirim (%)</label>
              <input
                type="number"
                min={0}
                max={90}
                value={cfg.flashSalePercent ?? 0}
                onChange={(e) => setCfg({ ...cfg, flashSalePercent: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Gece Pazarı Kutu Sayısı (1–6)</label>
              <input
                type="number"
                min={1}
                max={6}
                value={cfg.nightMarketBoxCount ?? 3}
                onChange={(e) => setCfg({ ...cfg, nightMarketBoxCount: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Gece Pazarı Yenilenme (Gün)</label>
              <input
                type="number"
                min={1}
                max={90}
                value={cfg.nightMarketCooldownDays ?? 7}
                onChange={(e) => setCfg({ ...cfg, nightMarketCooldownDays: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white"
              />
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 p-2.5 rounded-xl bg-white/5 border border-white/10 w-full cursor-pointer">
                <input
                  type="checkbox"
                  checked={cfg.invitePromoActive !== false}
                  onChange={(e) => setCfg({ ...cfg, invitePromoActive: e.target.checked })}
                  className="accent-amber-500"
                />
                <span>Davet Promosyonu Aktif</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {section === 'general' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 space-y-5">
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-bold text-amber-200 text-sm">Planlı Bakım Modu (Maintenance Mode)</div>
                <div className="text-zinc-300">Aktif edildiğinde yöneticiler dışındaki tüm kullanıcılara bakım ekranı gösterilir.</div>
              </div>
              <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
                <input type="checkbox" checked={Boolean(cfg.maintenanceMode)} onChange={(e) => setCfg({ ...cfg, maintenanceMode: e.target.checked })} className="accent-amber-500" />
                <span>{cfg.maintenanceMode ? 'BAKIM MODU AKTİF' : 'Kapalı (Site Canlı)'}</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-400 block mb-1">Site Adı</label>
                <input value={cfg.siteName || 'EmoçHosting'} onChange={(e) => setCfg({ ...cfg, siteName: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Destek İletişim E-postası</label>
                <input value={cfg.supportEmail || ''} onChange={(e) => setCfg({ ...cfg, supportEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Discord Sunucu Davet Linki</label>
                <input value={cfg.discordInviteUrl || ''} onChange={(e) => setCfg({ ...cfg, discordInviteUrl: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-indigo-200" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Bakım Modu Açıklaması</label>
                <input value={cfg.maintenanceMessage || ''} onChange={(e) => setCfg({ ...cfg, maintenanceMessage: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Ana Sayfa Üst Rozet Metni</label>
                <input value={cfg.heroBadgeText || ''} onChange={(e) => setCfg({ ...cfg, heroBadgeText: e.target.value })} placeholder="NVMe Gücü • Gerçek Süreç Motoru • Otomatik Domain" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">Alt Bilgi (Footer) Telif Notu</label>
                <input value={cfg.footerNote || ''} onChange={(e) => setCfg({ ...cfg, footerNote: e.target.value })} placeholder="Varsayılan: © 2026 EmoçHosting — Tüm hakları saklıdır." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <input type="checkbox" checked={cfg.showLiveStatsStrip !== false} onChange={(e) => setCfg({ ...cfg, showLiveStatsStrip: e.target.checked })} className="accent-amber-500" />
                <span>Ana Sayfa Canlı İstatistik Şeridini Göster</span>
              </label>
              <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                <input type="checkbox" checked={cfg.cookieBannerEnabled !== false} onChange={(e) => setCfg({ ...cfg, cookieBannerEnabled: e.target.checked })} className="accent-amber-500" />
                <span>Çerez &amp; Bildirim Onay Çubuğunu Göster</span>
              </label>
            </div>

            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-zinc-300 font-semibold">Üst Duyuru Bannerı (Navbar Üzeri)</label>
                <label className="flex items-center gap-2 text-amber-300 cursor-pointer">
                  <input type="checkbox" checked={Boolean(cfg.announcementActive)} onChange={(e) => setCfg({ ...cfg, announcementActive: e.target.checked })} className="accent-amber-500" />
                  <span>Bannerı Göster</span>
                </label>
              </div>
              <input value={cfg.announcementBanner || ''} onChange={(e) => setCfg({ ...cfg, announcementBanner: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>

            <div>
              <label className="text-zinc-400 block mb-1">Ana Sayfa / Footer Alt Başlık (Tagline)</label>
              <input value={cfg.siteTagline || ''} onChange={(e) => setCfg({ ...cfg, siteTagline: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MegaphoneIcon className="w-5 h-5 text-amber-400" />
              <h4 className="font-display text-base font-bold text-white">Platform Duyuru Kartları</h4>
            </div>
            <form onSubmit={addAnnouncement} className="grid grid-cols-1 sm:grid-cols-6 gap-2.5">
              <input required value={newAnn.title} onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })} placeholder="Duyuru Başlığı" className="sm:col-span-2 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              <input required value={newAnn.message} onChange={(e) => setNewAnn({ ...newAnn, message: e.target.value })} placeholder="Duyuru içeriği..." className="sm:col-span-2 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              <select value={newAnn.type} onChange={(e) => setNewAnn({ ...newAnn, type: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
                <option value="info">Bilgi</option>
                <option value="success">Başarı / Açılış</option>
                <option value="warning">Uyarı</option>
                <option value="danger">Kritik</option>
              </select>
              <AnimatedButton type="submit" size="xs"><PlusIcon className="w-4 h-4" /> Ekle</AnimatedButton>
            </form>
            <div className="space-y-2 max-h-52 overflow-y-auto">
              {announcements.map((a) => (
                <div key={a.id} className="p-3 rounded-xl bg-white/5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-white">[{a.type}] {a.title}</span>
                    <div className="text-zinc-400 truncate">{a.message}</div>
                  </div>
                  <button type="button" onClick={() => deleteAnnouncement(a.id)} className="text-rose-400 p-1 shrink-0"><TrashIcon className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {section === 'security' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ShieldAdminIcon className="w-5 h-5 text-rose-400" />
            <h4 className="font-display text-lg font-bold text-white">Kayıt, Kullanıcı İzinleri &amp; Yasal Metinler</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={cfg.registrationOpen !== false} onChange={(e) => setCfg({ ...cfg, registrationOpen: e.target.checked })} className="accent-amber-500" />
              <span>Yeni Kullanıcı Kayıtlarına Açık</span>
            </label>
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={cfg.allowSubdomainEdit !== false} onChange={(e) => setCfg({ ...cfg, allowSubdomainEdit: e.target.checked })} className="accent-amber-500" />
              <span>Kullanıcı Alt Alan Adı Değiştirebilsin</span>
            </label>
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={cfg.allowUserApiKeys !== false} onChange={(e) => setCfg({ ...cfg, allowUserApiKeys: e.target.checked })} className="accent-amber-500" />
              <span>Kişisel API Anahtarı Oluşturma Açık</span>
            </label>
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={Boolean(cfg.requireVerifiedEmailForPurchase)} onChange={(e) => setCfg({ ...cfg, requireVerifiedEmailForPurchase: e.target.checked })} className="accent-amber-500" />
              <span>Satın Almada Doğrulanmış E-posta Zorunlu</span>
            </label>
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={cfg.welcomeNotificationEnabled !== false} onChange={(e) => setCfg({ ...cfg, welcomeNotificationEnabled: e.target.checked })} className="accent-amber-500" />
              <span>Yeni Üyelere Hoş Geldin Bildirimi</span>
            </label>
            {isOwner && (
              <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-400/25 text-rose-200 cursor-pointer">
                <input type="checkbox" checked={Boolean(cfg.onlyOwnerAdminMode)} onChange={(e) => setCfg({ ...cfg, onlyOwnerAdminMode: e.target.checked })} className="accent-rose-500" />
                <span>Sadece Kurucu Yönetici Admin Kilidi</span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1">Sunucu Başına Max Ortak Kullanıcı</label>
              <input type="number" min={0} max={50} value={cfg.maxCollaboratorsPerServer ?? 10} onChange={(e) => setCfg({ ...cfg, maxCollaboratorsPerServer: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Global Maksimum RAM Havuzu (MB)</label>
              <input type="number" min={512} value={cfg.globalMaxRamMb ?? 65536} onChange={(e) => setCfg({ ...cfg, globalMaxRamMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Hoş Geldin Bildirim Mesajı</label>
              <input value={cfg.welcomeNotificationMessage || ''} onChange={(e) => setCfg({ ...cfg, welcomeNotificationMessage: e.target.value })} placeholder="Hoş geldiniz! Fırsatlara göz atın..." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/10">
            <div>
              <label className="text-zinc-400 block mb-1">Hizmet Kullanım Şartları (ToS)</label>
              <textarea rows={6} value={cfg.tosText || ''} onChange={(e) => setCfg({ ...cfg, tosText: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Gizlilik &amp; KVKK Aydınlatma Metni</label>
              <textarea rows={6} value={cfg.privacyText || ''} onChange={(e) => setCfg({ ...cfg, privacyText: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>
        </div>
      )}

      {section === 'quotas' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1">Kullanıcı Başına Max Sunucu</label>
              <input type="number" min={1} value={cfg.maxServersPerUser ?? 10} onChange={(e) => setCfg({ ...cfg, maxServersPerUser: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Max Dosya Yükleme (MB)</label>
              <input type="number" min={1} value={cfg.maxUploadMb ?? 100} onChange={(e) => setCfg({ ...cfg, maxUploadMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">CPU Alarm Eşiği (%)</label>
              <input type="number" min={10} max={100} value={cfg.cpuAlertThresholdPct ?? 85} onChange={(e) => setCfg({ ...cfg, cpuAlertThresholdPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">RAM Alarm Eşiği (%)</label>
              <input type="number" min={10} max={100} value={cfg.ramAlertThresholdPct ?? 90} onChange={(e) => setCfg({ ...cfg, ramAlertThresholdPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer">
              <input type="checkbox" checked={cfg.autoSuspendExpired !== false} onChange={(e) => setCfg({ ...cfg, autoSuspendExpired: e.target.checked })} className="accent-amber-500" />
              <span>Süresi dolan sunucuları otomatik askıya al</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer">
              <input type="checkbox" checked={cfg.autoRestartCrashed !== false} onChange={(e) => setCfg({ ...cfg, autoRestartCrashed: e.target.checked })} className="accent-amber-500" />
              <span>Çöken süreçleri otomatik kurtar (Global Watchdog)</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer">
              <input type="checkbox" checked={cfg.notifyDiscordOnPurchase !== false} onChange={(e) => setCfg({ ...cfg, notifyDiscordOnPurchase: e.target.checked })} className="accent-amber-500" />
              <span>Yeni sunucu kurulumunda Discord Webhook gönder</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer">
              <input type="checkbox" checked={cfg.notifyDiscordOnTicket !== false} onChange={(e) => setCfg({ ...cfg, notifyDiscordOnTicket: e.target.checked })} className="accent-amber-500" />
              <span>Yeni destek talebinde Discord Webhook gönder</span>
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-zinc-400 block">Discord Webhook Bildirim URL</label>
            <div className="flex gap-2">
              <input value={cfg.discordWebhookUrl || ''} onChange={(e) => setCfg({ ...cfg, discordWebhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/..." className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
              <AnimatedButton variant="secondary" size="xs" onClick={testWebhook}>Test Gönder</AnimatedButton>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-zinc-400 block">CurseForge Resmi API Anahtarı (Boşsa CurseTools köprüsü kullanılır)</label>
            <input type="password" value={cfg.curseforgeApiKey || ''} onChange={(e) => setCfg({ ...cfg, curseforgeApiKey: e.target.value })} placeholder="$2a$10$..." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
          </div>
        </div>
      )}

      {section === 'seo' && (
        <div className="glass-panel rounded-3xl p-6 space-y-4">
          <h4 className="font-display text-lg font-bold text-white">SEO, Meta &amp; Sosyal Medya Kart Ayarları</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1">Varsayılan SEO Başlığı</label>
              <input value={cfg.seoTitle || ''} onChange={(e) => setCfg({ ...cfg, seoTitle: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">OpenGraph Görsel URL</label>
              <input value={cfg.ogImageUrl || '/assets/og-banner.jpg'} onChange={(e) => setCfg({ ...cfg, ogImageUrl: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-zinc-400 block mb-1">SEO Anahtar Kelimeler</label>
              <input value={cfg.seoKeywords || ''} onChange={(e) => setCfg({ ...cfg, seoKeywords: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div className="sm:col-span-2">
              <label className="text-zinc-400 block mb-1">SEO Açıklaması (Meta Description)</label>
              <textarea rows={3} value={cfg.seoDescription || ''} onChange={(e) => setCfg({ ...cfg, seoDescription: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
