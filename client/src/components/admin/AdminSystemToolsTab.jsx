import React, { useState, useEffect } from 'react';
import { apiRequest, downloadAuthenticatedFile } from '../../lib/api';
import { ADMIN_API_PREFIX } from '../../lib/adminConfig';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon } from '../icons/EmoIcons';

export function AdminSystemToolsTab({ onRefresh }) {
  const toast = useToast();
  const [subTab, setSubTab] = useState('diagnostics');

  const [diag, setDiag] = useState(null);
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
    if (subTab === 'diagnostics') apiRequest(`${ADMIN_API_PREFIX}/system/diagnostics`).then(setDiag).catch(() => {});
    if (subTab === 'security') apiRequest(`${ADMIN_API_PREFIX}/ip-bans`).then((d) => setIpBans(d.items || []));
    if (subTab === 'incidents') apiRequest(`${ADMIN_API_PREFIX}/incidents`).then((d) => setIncidents(d.items || []));
    if (subTab === 'logs') apiRequest(`${ADMIN_API_PREFIX}/audit-logs`).then((d) => setAuditLogs(d.logs || []));
    if (subTab === 'ledger') apiRequest(`${ADMIN_API_PREFIX}/transactions`).then((d) => setTransactions(d.transactions || []));
    if (subTab === 'backups') apiRequest(`${ADMIN_API_PREFIX}/backups`).then(setBackups);
    if (subTab === 'templates') apiRequest(`${ADMIN_API_PREFIX}/templates`).then((d) => setTemplates(d.items || []));
    if (subTab === 'network') apiRequest(`${ADMIN_API_PREFIX}/network-map`).then(setNetworkMap);
  }, [subTab]);

  async function clearCache() {
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/system/cache-clear`, { method: 'POST' });
      toast.success('Bootstrap önbelleği temizlendi!');
      onRefresh?.();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    try {
      await apiRequest(`${ADMIN_API_PREFIX}/notifications/broadcast`, { method: 'POST', body: broadcast });
      toast.success('Bildirim tüm kullanıcılara yayınlandı!');
      setBroadcast({ uid: 'all', title: '', message: '', type: 'info' });
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function exportReport(type) {
    try {
      await downloadAuthenticatedFile(`${ADMIN_API_PREFIX}/export/${encodeURIComponent(type)}`, `emochosting-${type}.json`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function cleanupOrphans() {
    try {
      const res = await apiRequest(`${ADMIN_API_PREFIX}/maintenance/cleanup`, { method: 'POST' });
      toast.success(`Temizlik tamamlandı: ${res.cleanedFolders} yetim klasör silindi. Toplam disk: ${res.totalInstancesSizeMb} MB`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  const subTabs = [
    { id: 'diagnostics', label: 'Altyapı Tanı & Önbellek' },
    { id: 'security', label: 'IP Güvenlik Duvarı' },
    { id: 'incidents', label: 'Sistem Durumu & Broadcast' },
    { id: 'backups', label: 'Global Yedekler & Temizlik' },
    { id: 'network', label: 'Canlı Ağ & Port Haritası' },
    { id: 'templates', label: 'Başlangıç Şablonları' },
    { id: 'logs', label: 'Denetim Kayıtları (Audit)' },
    { id: 'ledger', label: 'Bakiye Defteri & Dışa Aktar' },
  ];

  return (
    <div className="space-y-6 text-xs">
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {subTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`shrink-0 px-3 py-1.5 rounded-xl font-bold border transition ${
              subTab === t.id ? 'bg-amber-500/15 border-amber-500/45 text-amber-200' : 'bg-white/5 border-white/10 text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'diagnostics' && (
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-display text-lg font-bold text-white">Gerçek Zamanlı Altyapı &amp; Süreç Tanısı</h4>
              <p className="text-zinc-400">Backend bellek kullanımı, Firebase modu, canlı portlar ve bootstrap önbelleği</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <AnimatedButton size="xs" variant="secondary" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/system/diagnostics`).then(setDiag)}>
                Tanıyı Yenile
              </AnimatedButton>
              <AnimatedButton size="xs" variant="warning" onClick={clearCache}>
                Önbelleği Temizle
              </AnimatedButton>
            </div>
          </div>

          {diag && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">FİREBASE MODU</div>
                <div className={`text-sm font-bold mt-1 ${diag.dbReady ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {diag.firebaseMode} ({diag.dbReady ? 'Hazır' : 'Hata'})
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">NODE.JS / PLATFORM</div>
                <div className="text-sm font-bold text-white mt-1">{diag.nodeVersion} • {diag.platform}</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">BELLEK (RSS / HEAP)</div>
                <div className="text-sm font-bold text-amber-300 mt-1">{diag.memoryMb?.rss} MB / {diag.memoryMb?.heapUsed} MB</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">AKTİF ALT SÜREÇ</div>
                <div className="text-sm font-bold text-emerald-400 mt-1">{diag.activeProcessesCount} süreç</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">SFTP (:{diag.sftpPort})</div>
                <div className={`text-sm font-bold mt-1 ${diag.sftpPortOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {diag.sftpPortOpen ? 'ÇEVRİMİÇİ' : 'KAPALI'}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">MC PROXY (:{diag.mcProxyPort})</div>
                <div className={`text-sm font-bold mt-1 ${diag.mcProxyPortOpen ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {diag.mcProxyPortOpen ? 'ÇEVRİMİÇİ' : 'KAPALI'}
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">BACKEND UPTİME</div>
                <div className="text-sm font-bold text-white mt-1">{Math.floor((diag.uptimeSec || 0) / 60)} dk</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-zinc-950/70 border border-white/10">
                <div className="text-zinc-500 text-[10px]">PROJE ID / PID</div>
                <div className="text-sm font-bold text-zinc-200 mt-1">{diag.projectId} (#{diag.pid})</div>
              </div>
            </div>
          )}
        </div>
      )}

      {subTab === 'security' && (
        <div className="glass-panel rounded-3xl p-6 space-y-4">
          <h4 className="font-bold text-white text-sm">IP Güvenlik Duvarı (IP Ban Listesi)</h4>
          <div className="flex flex-wrap gap-2">
            <input value={newIp.ip} onChange={(e) => setNewIp({ ...newIp, ip: e.target.value })} placeholder="IP Adresi (örn: 192.0.2.1)" className="px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
            <input value={newIp.reason} onChange={(e) => setNewIp({ ...newIp, reason: e.target.value })} placeholder="Sebep" className="flex-1 min-w-[180px] px-3 py-2 rounded-xl bg-zinc-950 border border-white/15 text-white" />
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
                <button type="button" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/ip-bans/${b.id}`, { method: 'DELETE' }).then(() => setIpBans((p) => p.filter((x) => x.id !== b.id)))} className="text-rose-300">Kaldır</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'incidents' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <button type="button" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/incidents/${inc.id}`, { method: 'PATCH', body: { status: 'resolved' } }).then(() => apiRequest(`${ADMIN_API_PREFIX}/incidents`).then((d) => setIncidents(d.items || [])))} className="text-emerald-300">Çözüldü</button>
                    <button type="button" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/incidents/${inc.id}`, { method: 'DELETE' }).then(() => setIncidents((p) => p.filter((x) => x.id !== inc.id)))} className="text-rose-400">Sil</button>
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
        <div className="glass-panel rounded-3xl p-6 space-y-4">
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
                  type="button"
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
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="font-bold text-white text-sm">Canlı Ağ, Port &amp; Subdomain Haritası</h4>
              <p className="text-zinc-400">Tüm bağlı TCP/HTTP proxy portları ve aktif sunucu düğümleri</p>
            </div>
            <AnimatedButton size="xs" variant="secondary" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/network-map`).then(setNetworkMap)}>
              Haritayı Yenile
            </AnimatedButton>
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
        <div className="glass-panel rounded-3xl p-6 space-y-5">
          <h4 className="font-bold text-white text-sm">Başlangıç Şablonları Yönetimi</h4>
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
              onClick={() => apiRequest(`${ADMIN_API_PREFIX}/templates`, { method: 'POST', body: newTpl }).then(() => { setNewTpl({ category: 'web', name: '', description: '' }); apiRequest(`${ADMIN_API_PREFIX}/templates`).then((d) => setTemplates(d.items || [])); })}
            >
              Şablon Ekle
            </AnimatedButton>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="px-3 py-1.5 rounded-xl bg-white/5 flex items-center gap-2">
                <span>[{t.category}] {t.name}</span>
                <button type="button" onClick={() => apiRequest(`${ADMIN_API_PREFIX}/templates/${t.id}`, { method: 'DELETE' }).then(() => setTemplates((p) => p.filter((x) => x.id !== t.id)))} className="text-rose-400">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'logs' && (
        <div className="glass-panel rounded-3xl p-6 space-y-3">
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
        <div className="glass-panel rounded-3xl p-6 space-y-5">
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
