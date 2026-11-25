import React, { useState, useEffect } from 'react';
import { apiRequest, downloadAuthenticatedFile } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon } from '../icons/EmoIcons';

export function AdminSystemToolsTab({ config, isOwner, onRefresh }) {
  const toast = useToast();
  const [cfg, setCfg] = useState(config || {});
  const [subTab, setSubTab] = useState('general');

  const [ipBans, setIpBans] = useState([]);
  const [newIp, setNewIp] = useState({ ip: '', reason: '' });
  const [incidents, setIncidents] = useState([]);
  const [newIncident, setNewIncident] = useState({ title: '', message: '', severity: 'degraded', status: 'investigating' });
  const [broadcast, setBroadcast] = useState({ uid: 'all', title: '', message: '', type: 'info' });
  const [auditLogs, setAuditLogs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [backups, setBackups] = useState({ backups: [], totalSizeMb: 0 });
  const [templates, setTemplates] = useState([]);
  const [newTpl, setNewTpl] = useState({ category: 'web', name: '', description: '' });
  const [networkMap, setNetworkMap] = useState(null);

  useEffect(() => {
    setCfg(config || {});
  }, [config]);

  useEffect(() => {
    if (subTab === 'security') apiRequest(`${ADMIN_API_PREFIX}/ip-bans`).then((d) => setIpBans(d.items || []));
    if (subTab === 'incidents') apiRequest(`${ADMIN_API_PREFIX}/incidents`).then((d) => setIncidents(d.items || []));
    if (subTab === 'logs') apiRequest(`${ADMIN_API_PREFIX}/audit-logs`).then((d) => setAuditLogs(d.logs || []));
    if (subTab === 'ledger') apiRequest(`${ADMIN_API_PREFIX}/transactions`).then((d) => setTransactions(d.transactions || []));
    if (subTab === 'backups') apiRequest(`${ADMIN_API_PREFIX}/backups`).then(setBackups);
    if (subTab === 'templates') apiRequest(`${ADMIN_API_PREFIX}/templates`).then((d) => setTemplates(d.items || []));
    if (subTab === 'network') apiRequest(`${ADMIN_API_PREFIX}/network-map`).then(setNetworkMap);
  }, [subTab]);

  async function saveConfig() {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/config`, { method: 'PATCH', body: cfg });
      toast.success('Sistem ayarları kaydedildi!');
      onRefresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function testWebhook() {
    const res = await apiRequest(`${ADMIN_API_PREFIX}/webhook/test`, { method: 'POST' });
    if (res.sent) toast.success('Discord Webhook testi gönderildi!');
    else toast.error(res.reason || 'Webhook gönderilemedi');
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    await apiRequest(`${ADMIN_API_PREFIX}/notifications/broadcast`, { method: 'POST', body: broadcast });
    toast.success('Bildirim tüm kullanıcılara yayınlandı!');
    setBroadcast({ uid: 'all', title: '', message: '', type: 'info' });
  }

  async function exportReport(type) {
    try {
      await downloadAuthenticatedFile(`${ADMIN_API_PREFIX}/export/${encodeURIComponent(type)}`, `emochosting-${type}.json`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function cleanupOrphans() {
    const res = await apiRequest(`${ADMIN_API_PREFIX}/maintenance/cleanup`, { method: 'POST' });
    toast.success(`Temizlik tamamlandı: ${res.cleanedFolders} yetim klasör silindi. Toplam disk: ${res.totalInstancesSizeMb} MB`);
  }

  const subTabs = [
    { id: 'general', label: 'Bakım, Discord & Duyuru' },
    { id: 'quotas', label: 'Kotalar, Watchdog & Webhook' },
    { id: 'security', label: 'Güvenlik, Kayıt & IP Ban' },
    { id: 'incidents', label: 'Sistem Durumu & Bildirimler' },
    { id: 'backups', label: 'Global Yedekler & Temizlik' },
    { id: 'network', label: 'Ağ Haritası & Etkinlik' },
    { id: 'templates', label: 'Şablonlar & Yasal Metin' },
    { id: 'logs', label: 'Denetim Kayıtları (Audit)' },
    { id: 'ledger', label: 'Bakiye Defteri & Dışa Aktar' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
              subTab === t.id ? 'bg-amber-500/15 border-amber-500/45 text-amber-200' : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'general' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-bold text-amber-200 text-sm">Site Bakım Modu (Maintenance Mode)</div>
              <div className="text-zinc-300">Aktif edildiğinde adminler hariç tüm ziyaretçilere Bakım Ekranı gösterilir.</div>
            </div>
            <label className="flex items-center gap-2 font-bold text-white cursor-pointer">
              <input type="checkbox" checked={Boolean(cfg.maintenanceMode)} onChange={(e) => setCfg({ ...cfg, maintenanceMode: e.target.checked })} />
              <span>{cfg.maintenanceMode ? 'BAKIM MODU AKTİF' : 'Kapalı (Canlı)'}</span>
            </label>
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Bakım Modu Mesajı</label>
            <input value={cfg.maintenanceMessage || ''} onChange={(e) => setCfg({ ...cfg, maintenanceMessage: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1">Discord Sunucu Davet Linki</label>
              <input value={cfg.discordInviteUrl || ''} onChange={(e) => setCfg({ ...cfg, discordInviteUrl: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-indigo-200" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Destek İletişim E-postası</label>
              <input value={cfg.supportEmail || ''} onChange={(e) => setCfg({ ...cfg, supportEmail: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-zinc-400">Üst Duyuru Bannerı</label>
              <label className="flex items-center gap-2 text-amber-300">
                <input type="checkbox" checked={Boolean(cfg.announcementActive)} onChange={(e) => setCfg({ ...cfg, announcementActive: e.target.checked })} />
                <span>Banner Göster</span>
              </label>
            </div>
            <input value={cfg.announcementBanner || ''} onChange={(e) => setCfg({ ...cfg, announcementBanner: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>

          <div>
            <label className="text-zinc-400 block mb-1">Ana Sayfa Alt Başlık (Tagline)</label>
            <input value={cfg.siteTagline || ''} onChange={(e) => setCfg({ ...cfg, siteTagline: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
          </div>

          <AnimatedButton variant="emerald" onClick={saveConfig}>Genel Ayarları Kaydet</AnimatedButton>
        </div>
      )}

      {subTab === 'quotas' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-zinc-400 block mb-1">Kullanıcı Başına Max Sunucu</label>
              <input type="number" value={cfg.maxServersPerUser || 10} onChange={(e) => setCfg({ ...cfg, maxServersPerUser: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Max Dosya Yükleme (MB)</label>
              <input type="number" value={cfg.maxUploadMb || 100} onChange={(e) => setCfg({ ...cfg, maxUploadMb: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Yeni Üye Başlangıç Bakiyesi (İnvite)</label>
              <input type="number" value={cfg.defaultStartingBalance || 0} onChange={(e) => setCfg({ ...cfg, defaultStartingBalance: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">CPU Alarm Eşiği (%)</label>
              <input type="number" value={cfg.cpuAlertThresholdPct || 85} onChange={(e) => setCfg({ ...cfg, cpuAlertThresholdPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">RAM Alarm Eşiği (%)</label>
              <input type="number" value={cfg.ramAlertThresholdPct || 90} onChange={(e) => setCfg({ ...cfg, ramAlertThresholdPct: Number(e.target.value) })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5">
              <input type="checkbox" checked={cfg.autoSuspendExpired !== false} onChange={(e) => setCfg({ ...cfg, autoSuspendExpired: e.target.checked })} />
              <span>Süresi dolan sunucuları otomatik askıya al</span>
            </label>
            <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5">
              <input type="checkbox" checked={cfg.autoRestartCrashed !== false} onChange={(e) => setCfg({ ...cfg, autoRestartCrashed: e.target.checked })} />
              <span>Çöken süreçleri otomatik kurtar (Global Watchdog)</span>
            </label>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-zinc-400 block">Discord Webhook Bildirim URL (Gerçek Embed Gönderir)</label>
            <div className="flex gap-2">
              <input value={cfg.discordWebhookUrl || ''} onChange={(e) => setCfg({ ...cfg, discordWebhookUrl: e.target.value })} placeholder="https://discord.com/api/webhooks/..." className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
              <AnimatedButton variant="secondary" size="xs" onClick={testWebhook}>Test Gönder</AnimatedButton>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-white/10">
            <label className="text-zinc-400 block">CurseForge Resmi API Anahtarı (İsteğe Bağlı — Boşsa CurseTools Köprüsü Kullanılır)</label>
            <input type="password" value={cfg.curseforgeApiKey || ''} onChange={(e) => setCfg({ ...cfg, curseforgeApiKey: e.target.value })} placeholder="$2a$10$..." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 font-mono text-white" />
          </div>

          <div className="space-y-3 pt-2 border-t border-white/10">
            <h4 className="font-bold text-white">SEO, Meta &amp; OpenGraph Ayarları</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-400 block mb-1">SEO Başlığı</label>
                <input value={cfg.seoTitle || ''} onChange={(e) => setCfg({ ...cfg, seoTitle: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div>
                <label className="text-zinc-400 block mb-1">SEO Anahtar Kelimeler</label>
                <input value={cfg.seoKeywords || ''} onChange={(e) => setCfg({ ...cfg, seoKeywords: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-zinc-400 block mb-1">SEO Açıklaması (Meta Description)</label>
                <textarea rows={2} value={cfg.seoDescription || ''} onChange={(e) => setCfg({ ...cfg, seoDescription: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              </div>
            </div>
          </div>

          <AnimatedButton variant="emerald" onClick={saveConfig}>Kota, SEO &amp; API Ayarlarını Kaydet</AnimatedButton>
        </div>
      )}

      {subTab === 'security' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <input type="checkbox" checked={cfg.registrationOpen !== false} onChange={(e) => setCfg({ ...cfg, registrationOpen: e.target.checked })} />
              <span>Yeni Kullanıcı Kayıtlarına Açık</span>
            </label>
            {isOwner && (
              <label className="flex items-center gap-2 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-400/25 text-rose-200">
                <input type="checkbox" checked={Boolean(cfg.onlyOwnerAdminMode)} onChange={(e) => setCfg({ ...cfg, onlyOwnerAdminMode: e.target.checked })} />
                <span>Sadece Kurucu Yönetici Admin Kilidi (Diğer Adminleri Kapat)</span>
              </label>
            )}
          </div>
          <AnimatedButton variant="emerald" size="sm" onClick={saveConfig}>Güvenlik Politikasını Kaydet</AnimatedButton>

          <div className="border-t border-white/10 pt-4 space-y-3">
            <h4 className="font-bold text-white text-sm">IP Güvenlik Duvarı (IP Ban Listesi)</h4>
            <div className="flex gap-2">
              <input value={newIp.ip} onChange={(e) => setNewIp({ ...newIp, ip: e.target.value })} placeholder="IP Adresi" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              <input value={newIp.reason} onChange={(e) => setNewIp({ ...newIp, reason: e.target.value })} placeholder="Sebep" className="flex-1 px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
              <AnimatedButton
                size="xs"
                variant="danger"
                onClick={() =>
                  apiRequest(`${ADMIN_API_PREFIX}/ip-bans`, { method: 'POST', body: newIp })
                    .then(() => {
                      setNewIp({ ip: '', reason: '' });
                      apiRequest(`${ADMIN_API_PREFIX}/ip-bans`).then((d) => setIpBans(d.items || []));
                      toast.success('IP banlandı');
                    })
                    .catch((err) => toast.error(err.message))
                }
              >
                IP Banla
              </AnimatedButton>
            </div>
            <div className="space-y-1.5">
              {ipBans.map((b) => (
                <div key={b.id} className="p-2.5 rounded-xl bg-rose-500/10 flex justify-between items-center font-mono">
                  <span>{b.ip} — {b.reason}</span>
                  <button onClick={() => apiRequest(`${ADMIN_API_PREFIX}/ip-bans/${b.id}`, { method: 'DELETE' }).then(() => setIpBans((p) => p.filter((x) => x.id !== b.id)))} className="text-rose-300">Kaldır</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {subTab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          <div className="glass-panel rounded-3xl p-6 space-y-4">
            <h4 className="font-bold text-white text-sm">Sistem Durumu (Status Page) Olayı Ekle</h4>
            <input value={newIncident.title} onChange={(e) => setNewIncident({ ...newIncident, title: e.target.value })} placeholder="Olay Başlığı" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <textarea rows={2} value={newIncident.message} onChange={(e) => setNewIncident({ ...newIncident, message: e.target.value })} placeholder="Detaylı açıklama" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <div className="flex gap-2">
              <select value={newIncident.status} onChange={(e) => setNewIncident({ ...newIncident, status: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
                <option value="investigating">İnceleniyor</option>
                <option value="maintenance">Bakım</option>
                <option value="resolved">Çözüldü</option>
              </select>
              <AnimatedButton
                size="xs"
                onClick={() =>
                  apiRequest(`${ADMIN_API_PREFIX}/incidents`, { method: 'POST', body: newIncident }).then(() => {
                    setNewIncident({ title: '', message: '', severity: 'degraded', status: 'investigating' });
                    apiRequest(`${ADMIN_API_PREFIX}/incidents`).then((d) => setIncidents(d.items || []));
                    toast.success('Olay yayınlandı');
                  })
                }
              >
                Yayınla
              </AnimatedButton>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {incidents.map((inc) => (
                <div key={inc.id} className="p-2.5 rounded-xl bg-white/5 flex justify-between items-center">
                  <span>{inc.title} ({inc.status})</span>
                  <div className="flex gap-2">
                    <button onClick={() => apiRequest(`${ADMIN_API_PREFIX}/incidents/${inc.id}`, { method: 'PATCH', body: { status: 'resolved' } }).then(() => apiRequest(`${ADMIN_API_PREFIX}/incidents`).then((d) => setIncidents(d.items || [])))} className="text-emerald-300">Çözüldü</button>
                    <button onClick={() => apiRequest(`${ADMIN_API_PREFIX}/incidents/${inc.id}`, { method: 'DELETE' }).then(() => setIncidents((p) => p.filter((x) => x.id !== inc.id)))} className="text-rose-400">Sil</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={sendBroadcast} className="glass-panel rounded-3xl p-6 space-y-3">
            <h4 className="font-bold text-white text-sm">Tüm Kullanıcılara Bildirim Yayınla (Broadcast)</h4>
            <input required value={broadcast.title} onChange={(e) => setBroadcast({ ...broadcast, title: e.target.value })} placeholder="Bildirim Başlığı" className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <textarea required rows={3} value={broadcast.message} onChange={(e) => setBroadcast({ ...broadcast, message: e.target.value })} placeholder="Mesaj içeriği..." className="w-full px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <AnimatedButton type="submit" variant="primary" size="sm">Herkese Bildirim Gönder</AnimatedButton>
          </form>
        </div>
      )}

      {subTab === 'backups' && (
        <div className="glass-panel rounded-3xl p-6 space-y-4 text-xs">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h4 className="font-bold text-white text-sm">Global Yedekleme Deposu ({backups.totalSizeMb} MB)</h4>
              <p className="text-zinc-400">Disk üzerindeki tüm sunucu .zip yedeklerini görün ve temizleyin.</p>
            </div>
            <AnimatedButton size="sm" variant="warning" onClick={cleanupOrphans}>
              Yetim Sunucu Klasörlerini Temizle
            </AnimatedButton>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {backups.backups.map((b) => (
              <div key={`${b.serverId}-${b.filename}`} className="p-3 rounded-xl bg-white/5 flex justify-between items-center font-mono">
                <span>[{b.serverId}] {b.filename} ({b.sizeMb} MB)</span>
                <button
                  onClick={() => apiRequest(`${ADMIN_API_PREFIX}/backups/${b.serverId}/${encodeURIComponent(b.filename)}`, { method: 'DELETE' }).then(() => apiRequest(`${ADMIN_API_PREFIX}/backups`).then(setBackups))}
                  className="text-rose-400"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'network' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-white text-sm">Canlı Ağ, Port &amp; Subdomain Haritası</h4>
              <p className="text-zinc-400">Tüm bağlı TCP/HTTP proxy portları ve aktif sunucu düğümleri</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AnimatedButton
                size="xs"
                variant="secondary"
                onClick={() => apiRequest(`${ADMIN_API_PREFIX}/network-map`).then(setNetworkMap)}
              >
                Haritayı Yenile
              </AnimatedButton>
              <AnimatedButton
                size="xs"
                variant="warning"
                onClick={() =>
                  apiRequest(`${ADMIN_API_PREFIX}/night-market/reset-all`, { method: 'POST' }).then((r) =>
                    toast.success(`${r.count} kullanıcının Gece Pazarı kutuları sıfırlandı!`)
                  )
                }
              >
                Tüm Gece Pazarlarını Sıfırla (3 Yeni Kutu)
              </AnimatedButton>
            </div>
          </div>

          {networkMap?.proxyPorts && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono">
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/10">
                <div className="text-zinc-500">HTTP API</div>
                <div className="text-amber-300 font-bold mt-0.5">:{networkMap.proxyPorts.httpApi}</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/10">
                <div className="text-zinc-500">MC SNI Proxy</div>
                <div className="text-emerald-400 font-bold mt-0.5">:{networkMap.proxyPorts.mcSniProxy}</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/10">
                <div className="text-zinc-500">SFTP (ssh2)</div>
                <div className="text-amber-300 font-bold mt-0.5">:{networkMap.proxyPorts.sftp}</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/10">
                <div className="text-zinc-500">Web Havuzu</div>
                <div className="text-white font-bold mt-0.5">{networkMap.proxyPorts.webRange}</div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-white/10">
                <div className="text-zinc-500">Oyun/Bot Havuzu</div>
                <div className="text-white font-bold mt-0.5">{networkMap.proxyPorts.allocRange}</div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500 uppercase">
                  <th className="py-2 px-2">Port</th>
                  <th className="py-2 px-2">Domain Adresi</th>
                  <th className="py-2 px-2">Sunucu</th>
                  <th className="py-2 px-2">Kategori</th>
                  <th className="py-2 px-2">Durum / PID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05] font-mono">
                {(networkMap?.nodes || []).map((n) => (
                  <tr key={n.id} className="hover:bg-white/[0.02]">
                    <td className="py-2.5 px-2 text-amber-300 font-bold">:{n.port}</td>
                    <td className="py-2.5 px-2 text-zinc-200">{n.domainAddress}</td>
                    <td className="py-2.5 px-2 text-white font-sans font-semibold">{n.name}</td>
                    <td className="py-2.5 px-2 uppercase text-zinc-400">{n.category}</td>
                    <td className="py-2.5 px-2">
                      <span className={n.status === 'running' ? 'text-emerald-400' : 'text-zinc-400'}>
                        {n.status} {n.pid ? `(PID ${n.pid})` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'templates' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <h4 className="font-bold text-white text-sm">Başlangıç Şablonları &amp; Yasal Metin Editörü</h4>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <select value={newTpl.category} onChange={(e) => setNewTpl({ ...newTpl, category: e.target.value })} className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white">
              <option value="web">Website</option>
              <option value="discord">Discord Bot</option>
              <option value="minecraft">Minecraft</option>
            </select>
            <input value={newTpl.name} onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })} placeholder="Şablon Adı" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <input value={newTpl.description} onChange={(e) => setNewTpl({ ...newTpl, description: e.target.value })} placeholder="Açıklama" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <AnimatedButton
              size="xs"
              onClick={() => apiRequest(`${ADMIN_API_PREFIX}/templates`, { method: 'POST', body: newTpl }).then(() => apiRequest(`${ADMIN_API_PREFIX}/templates`).then((d) => setTemplates(d.items || [])))}
            >
              Şablon Ekle
            </AnimatedButton>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="px-3 py-1.5 rounded-xl bg-white/5 flex items-center gap-2">
                <span>[{t.category}] {t.name}</span>
                <button onClick={() => apiRequest(`${ADMIN_API_PREFIX}/templates/${t.id}`, { method: 'DELETE' }).then(() => setTemplates((p) => p.filter((x) => x.id !== t.id)))} className="text-rose-400">×</button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-white/10">
            <div>
              <label className="text-zinc-400 block mb-1">Hizmet Şartları (ToS)</label>
              <textarea rows={4} value={cfg.tosText || ''} onChange={(e) => setCfg({ ...cfg, tosText: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">Gizlilik &amp; KVKK Metni</label>
              <textarea rows={4} value={cfg.privacyText || ''} onChange={(e) => setCfg({ ...cfg, privacyText: e.target.value })} className="w-full p-3 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            </div>
          </div>
          <AnimatedButton size="sm" variant="emerald" onClick={saveConfig}>Yasal Metinleri Kaydet</AnimatedButton>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="glass-panel rounded-3xl p-6 space-y-3 text-xs">
          <h4 className="font-bold text-white text-sm">Canlı Denetim Kayıtları (Audit Logs)</h4>
          <div className="max-h-96 overflow-y-auto space-y-1.5 font-mono">
            {auditLogs.map((l) => (
              <div key={l.id} className="p-2.5 rounded-xl bg-zinc-950/60 border border-white/5 flex flex-wrap justify-between gap-2">
                <span>
                  <span className="text-amber-300">[{l.action}]</span> {l.actorEmail} → {l.targetType}:{l.targetId}
                </span>
                <span className="text-zinc-500">{new Date(l.createdAt).toLocaleString('tr-TR')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'ledger' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5 text-xs">
          <div>
            <h4 className="font-bold text-white text-sm mb-3">Gerçek Veri Dışa Aktarım (JSON Raporları)</h4>
            <div className="flex flex-wrap gap-2">
              {['users', 'servers', 'transactions', 'coupons', 'tickets', 'audit_logs'].map((t) => (
                <AnimatedButton key={t} size="xs" variant="secondary" onClick={() => exportReport(t)}>
                  {t}.json İndir
                </AnimatedButton>
              ))}
            </div>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            <h4 className="font-bold text-white text-sm">Son Finans / Bakiye Hareketleri</h4>
            {transactions.map((tx) => (
              <div key={tx.id} className="p-2.5 rounded-xl bg-white/5 flex justify-between font-mono">
                <span>{tx.email} — {tx.note} ({tx.adminEmail})</span>
                <span className={tx.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} İnvite
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
