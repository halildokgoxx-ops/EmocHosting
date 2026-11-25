import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';

export function AltyapiPanel({ server, live, activeSection = 'product_main', onReload }) {
  const toast = useToast();
  const [envRaw, setEnvRaw] = useState('');
  const [kvRaw, setKvRaw] = useState('{}');
  const [runtime, setRuntime] = useState(server.config?.runtime || 'node');
  const [entryFile, setEntryFile] = useState(server.config?.entryFile || 'app.js');
  const [autoRestart, setAutoRestart] = useState(Boolean(server.config?.autoRestart));

  const apiBase = (
    import.meta.env.VITE_API_URL ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')
  ).replace(/\/+$/, '');
  const proxyUrl = `${apiBase}/apps/${server.slug}/`;

  useEffect(() => {
    apiRequest(`/api/servers/${server.id}/env`).then((d) => setEnvRaw(d.raw || '')).catch(() => {});
    apiRequest(`/api/servers/${server.id}/infra/kv`).then((d) => setKvRaw(JSON.stringify(d.kv || {}, null, 2))).catch(() => {});
  }, [server.id]);

  async function saveEnv() {
    await apiRequest(`/api/servers/${server.id}/env`, { method: 'POST', body: { raw: envRaw } });
    toast.success('.env kaydedildi');
  }

  async function saveKv() {
    try {
      const parsed = JSON.parse(kvRaw);
      await apiRequest(`/api/servers/${server.id}/infra/kv`, { method: 'POST', body: { kv: parsed } });
      toast.success('kv.json veri deposu kaydedildi');
    } catch {
      toast.error('Geçerli JSON formatı girin');
    }
  }

  async function saveConfig() {
    await apiRequest(`/api/servers/${server.id}/infra/config`, {
      method: 'POST',
      body: { runtime, entryFile, autoRestart },
    });
    toast.success('Altyapı motor ayarları kaydedildi');
    onReload?.();
  }

  if (activeSection === 'settings') {
    return (
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <h3 className="font-display text-lg font-bold text-white">Altyapı Çalışma Motoru Ayarları</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <select value={runtime} onChange={(e) => setRuntime(e.target.value)} className="px-3 py-2.5 rounded-xl bg-[#09090b] border border-white/10 text-xs text-white">
            <option value="node">Node.js v24</option>
            <option value="python">Python 3.13</option>
            <option value="java">Java 21 JAR</option>
          </select>
          <input value={entryFile} onChange={(e) => setEntryFile(e.target.value)} className="px-3 py-2.5 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-white" />
          <AnimatedButton size="sm" variant="emerald" onClick={saveConfig}>Kaydet</AnimatedButton>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
          <span>Otomatik Yeniden Başlatma (Watchdog)</span>
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div>
          <span className="text-zinc-400">HTTP Reverse Proxy:</span>{' '}
          <a href={proxyUrl} target="_blank" rel="noreferrer" className="font-mono text-amber-400 underline font-bold">
            {proxyUrl}
          </a>
        </div>
        <div className="font-mono text-zinc-300">
          Direct Port: <strong className="text-emerald-400">{server.port}</strong> • PID: {live?.pid || '-'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white">.env Değişkenleri &amp; Kurulum</span>
            <div className="flex gap-2">
              <AnimatedButton
                size="xs"
                variant="secondary"
                onClick={() => apiRequest(`/api/servers/${server.id}/discord/install`, { method: 'POST', body: { command: 'npm-install' } }).then(() => toast.success('npm install tamamlandı'))}
              >
                npm install
              </AnimatedButton>
              <AnimatedButton size="xs" variant="emerald" onClick={saveEnv}>Kaydet</AnimatedButton>
            </div>
          </div>
          <textarea rows={10} value={envRaw} onChange={(e) => setEnvRaw(e.target.value)} className="w-full p-3.5 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-amber-300" />
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-white">Kalıcı KV JSON Deposu (kv.json)</span>
            <AnimatedButton size="xs" variant="emerald" onClick={saveKv}>KV Kaydet</AnimatedButton>
          </div>
          <textarea rows={10} value={kvRaw} onChange={(e) => setKvRaw(e.target.value)} className="w-full p-3.5 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-emerald-300" />
        </div>
      </div>
    </div>
  );
}
