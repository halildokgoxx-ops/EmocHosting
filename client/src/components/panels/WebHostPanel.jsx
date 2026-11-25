import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { LiveConsoleTab } from './LiveConsoleTab';

export function WebHostPanel({ server, live, extra, consoleLines, activeSection = 'product_main', onReload }) {
  const toast = useToast();
  const [siteConfig, setSiteConfig] = useState(extra?.siteConfig || {});
  const [webLogs, setWebLogs] = useState(extra?.webLogs || []);
  const [envRaw, setEnvRaw] = useState('');
  const [blockedIpInput, setBlockedIpInput] = useState('');

  const domainAddr = server.domainAddress || `${server.subdomain || server.slug}.emochost.com`;
  const apiBase = (
    import.meta.env.VITE_API_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')
  ).replace(/\/+$/, '');
  const liveUrl = `${apiBase}/sites/${server.slug}/`;
  const directHost = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const directProto = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const directPortUrl = `${directProto}//${directHost}:${server.port}/`;

  useEffect(() => {
    apiRequest(`/api/servers/${server.id}/web/config`).then((d) => {
      setSiteConfig(d.config || {});
      setWebLogs(d.logs || []);
    }).catch(() => {});
    apiRequest(`/api/servers/${server.id}/env`).then((d) => setEnvRaw(d.raw || '')).catch(() => {});
  }, [server.id]);

  async function saveSiteConfig() {
    await apiRequest(`/api/servers/${server.id}/web/config`, { method: 'POST', body: { config: siteConfig } });
    toast.success('Web sunucu & güvenlik ayarları kaydedildi!');
    onReload?.();
  }

  async function applyTemplate(templateId) {
    await apiRequest(`/api/servers/${server.id}/web/apply-template`, { method: 'POST', body: { templateId } });
    toast.success('Web şablonu public_html/ içine uygulandı!');
  }

  async function saveEnv() {
    await apiRequest(`/api/servers/${server.id}/env`, { method: 'POST', body: { raw: envRaw } });
    toast.success('.env dosyası kaydedildi!');
  }

  if (activeSection === 'settings') {
    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-2xl p-5 space-y-5">
          <h3 className="font-display text-lg font-bold text-white">Website Çalışma Modu &amp; Güvenlik</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Çalışma Modu</label>
              <select
                value={siteConfig.mode || 'static'}
                onChange={(e) => setSiteConfig({ ...siteConfig, mode: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 text-sm text-white"
              >
                <option value="static">Static HTML / CSS / JS / SPA</option>
                <option value="node">Node.js Web Uygulaması (app.js)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">Özel Domain</label>
              <input
                value={siteConfig.customDomain || domainAddr}
                onChange={(e) => setSiteConfig({ ...siteConfig, customDomain: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/10 text-sm font-mono text-amber-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              { key: 'corsEnabled', label: 'CORS Başlıklarını Aktifleştir (*)' },
              { key: 'directoryListing', label: 'Klasör İndeksleme (index.html yoksa)' },
              { key: 'spaFallback', label: 'SPA Modu (404 -> index.html)' },
              { key: 'basicAuthEnabled', label: 'Şifreli Site Koruması (Basic Auth)' },
            ].map((opt) => (
              <label key={opt.key} className="flex items-center gap-2.5 p-3 rounded-xl bg-[#09090b] border border-white/[0.08] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(siteConfig[opt.key])}
                  onChange={(e) => setSiteConfig({ ...siteConfig, [opt.key]: e.target.checked })}
                />
                <span className="text-zinc-200">{opt.label}</span>
              </label>
            ))}
          </div>

          {siteConfig.basicAuthEnabled && (
            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-[#09090b] border border-amber-500/20">
              <input
                value={siteConfig.basicAuthUser || 'admin'}
                onChange={(e) => setSiteConfig({ ...siteConfig, basicAuthUser: e.target.value })}
                placeholder="Kullanıcı Adı"
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
              />
              <input
                value={siteConfig.basicAuthPass || ''}
                onChange={(e) => setSiteConfig({ ...siteConfig, basicAuthPass: e.target.value })}
                placeholder="Site Erişim Şifresi"
                className="px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
              />
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#09090b] border border-white/[0.07] space-y-2">
            <div className="text-xs font-bold text-white">IP Engelleme Listesi</div>
            <div className="flex gap-2">
              <input
                value={blockedIpInput}
                onChange={(e) => setBlockedIpInput(e.target.value)}
                placeholder="Engellenecek IP (örn: 192.168.1.50)"
                className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-white/10 text-xs text-white"
              />
              <AnimatedButton
                size="xs"
                variant="danger"
                onClick={() => {
                  if (!blockedIpInput.trim()) return;
                  setSiteConfig({
                    ...siteConfig,
                    blockedIps: Array.from(new Set([...(siteConfig.blockedIps || []), blockedIpInput.trim()])),
                  });
                  setBlockedIpInput('');
                }}
              >
                IP Ekle
              </AnimatedButton>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(siteConfig.blockedIps || []).map((ip) => (
                <span key={ip} className="px-2.5 py-1 rounded-lg bg-rose-500/20 text-rose-200 text-xs font-mono flex items-center gap-2">
                  {ip}
                  <button onClick={() => setSiteConfig({ ...siteConfig, blockedIps: siteConfig.blockedIps.filter((i) => i !== ip) })}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <AnimatedButton variant="emerald" onClick={saveSiteConfig}>Ayarları Kaydet</AnimatedButton>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-sm text-white">.env Ortam Değişkenleri</h4>
            <AnimatedButton size="xs" variant="emerald" onClick={saveEnv}>Kaydet</AnimatedButton>
          </div>
          <textarea
            rows={5}
            value={envRaw}
            onChange={(e) => setEnvRaw(e.target.value)}
            className="w-full p-3 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-amber-300"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-zinc-400">Canlı Yayın:</span>{' '}
            <a href={liveUrl} target="_blank" rel="noreferrer" className="font-mono text-amber-400 underline font-bold">
              {liveUrl}
            </a>
          </div>
          <div>
            <span className="text-zinc-400">Port:</span>{' '}
            <a href={directPortUrl} target="_blank" rel="noreferrer" className="font-mono text-emerald-400 underline">
              {directPortUrl}
            </a>
          </div>
        </div>
        <div className="font-mono text-zinc-300">
          İstekler: <strong className="text-white">{live?.requestsCount || 0}</strong> • Trafik:{' '}
          <strong className="text-amber-400">{((live?.bandwidthBytes || 0) / 1024).toFixed(1)} KB</strong>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h4 className="font-bold text-white text-sm">Modern Portföy Şablonu</h4>
          <p className="text-xs text-zinc-400">Karanlık obsidian tasarımlı hazır siteyi `public_html/index.html` üzerine yazar.</p>
          <AnimatedButton size="sm" onClick={() => applyTemplate('web-neon-portfolio')}>Şablonu Kur</AnimatedButton>
        </div>
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h4 className="font-bold text-white text-sm">Yakında Yayındayız Şablonu</h4>
          <p className="text-xs text-zinc-400">Minimal açılış / bakım ekranı uygular.</p>
          <AnimatedButton size="sm" variant="secondary" onClick={() => applyTemplate('web-coming-soon')}>Şablonu Kur</AnimatedButton>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-sm text-white">Gerçek Zamanlı HTTP İstek Kayıtları</h4>
          <AnimatedButton
            size="xs"
            variant="secondary"
            onClick={() => apiRequest(`/api/servers/${server.id}/web/config`).then((d) => setWebLogs(d.logs || []))}
          >
            Yenile
          </AnimatedButton>
        </div>
        <div className="rounded-xl bg-[#09090b] border border-white/[0.08] overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="border-b border-white/[0.08] text-zinc-400">
              <tr>
                <th className="p-3">Saat</th>
                <th className="p-3">Metot</th>
                <th className="p-3">Yol</th>
                <th className="p-3">Durum</th>
                <th className="p-3">Süre</th>
                <th className="p-3">Boyut</th>
                <th className="p-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {webLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-zinc-500">
                    Henüz HTTP isteği yok.
                  </td>
                </tr>
              ) : (
                webLogs.map((l, idx) => (
                  <tr key={idx}>
                    <td className="p-3 text-zinc-400">{l.time}</td>
                    <td className="p-3 text-amber-400">{l.method}</td>
                    <td className="p-3 text-white">{l.path}</td>
                    <td className={`p-3 font-bold ${l.status < 400 ? 'text-emerald-400' : 'text-rose-400'}`}>{l.status}</td>
                    <td className="p-3 text-zinc-300">{l.ms}ms</td>
                    <td className="p-3 text-zinc-300">{l.bytes} B</td>
                    <td className="p-3 text-zinc-500">{l.ip}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {siteConfig.mode === 'node' && (
        <div className="glass-panel rounded-2xl p-5">
          <LiveConsoleTab serverId={server.id} lines={consoleLines} status={live?.status || server.status} />
        </div>
      )}
    </div>
  );
}
