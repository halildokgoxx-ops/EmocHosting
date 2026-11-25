import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';

export function DiscordBotPanel({ server, live, activeSection = 'product_main', onReload }) {
  const toast = useToast();
  const [envObj, setEnvObj] = useState({ DISCORD_TOKEN: '', CLIENT_ID: '', GUILD_ID: '', PREFIX: '!', BOT_STATUS: '' });
  const [showToken, setShowToken] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [runtime, setRuntime] = useState(server.config?.runtime || 'node');
  const [entryFile, setEntryFile] = useState(server.config?.entryFile || 'index.js');
  const [autoRestart, setAutoRestart] = useState(Boolean(server.config?.autoRestart));
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    apiRequest(`/api/servers/${server.id}/env`).then((d) => setEnvObj(d.env || {})).catch(() => {});
  }, [server.id]);

  async function saveEnv() {
    await apiRequest(`/api/servers/${server.id}/env`, { method: 'POST', body: { env: envObj } });
    toast.success('.env ve Token kasası güncellendi!');
  }

  async function runInstall(command) {
    setInstalling(true);
    try {
      await apiRequest(`/api/servers/${server.id}/discord/install`, { method: 'POST', body: { command } });
      toast.success('Paket kurulumu tamamlandı!');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInstalling(false);
    }
  }

  async function saveRuntimeConfig() {
    await apiRequest(`/api/servers/${server.id}/discord/config`, {
      method: 'POST',
      body: { runtime, entryFile, autoRestart },
    });
    toast.success('Bot çalışma ayarları kaydedildi!');
    onReload?.();
  }

  async function applyTemplate(templateId) {
    await apiRequest(`/api/servers/${server.id}/discord/apply-template`, { method: 'POST', body: { templateId } });
    toast.success('Bot başlangıç şablonu uygulandı!');
    onReload?.();
  }

  if (activeSection === 'settings') {
    return (
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <h3 className="font-display text-lg font-bold text-white">Bot Çalışma Ortamı Ayarları</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Çalışma Ortamı</label>
            <select
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#09090b] border border-white/10 text-xs text-white"
            >
              <option value="node">Node.js v24</option>
              <option value="python">Python 3.13</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 block mb-1">Giriş Dosyası</label>
            <input
              value={entryFile}
              onChange={(e) => setEntryFile(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-white"
            />
          </div>
          <AnimatedButton size="sm" variant="emerald" onClick={saveRuntimeConfig}>Kaydet</AnimatedButton>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-300 pt-2">
          <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
          <span>Bot çökerse otomatik yeniden başlat (Watchdog)</span>
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap gap-4">
          <span><span className="text-zinc-400">Motor:</span> <strong className="text-amber-400 uppercase">{server.config?.runtime || 'node'}</strong></span>
          <span><span className="text-zinc-400">Dosya:</span> <strong className="font-mono text-white">{server.config?.entryFile || 'index.js'}</strong></span>
          <span><span className="text-zinc-400">PID:</span> <strong className="font-mono text-emerald-400">{live?.pid || '-'}</strong></span>
        </div>
        <span className="text-zinc-400">Watchdog: {server.config?.autoRestart ? 'Aktif' : 'Kapalı'}</span>
      </div>

      {/* Token & .env Vault */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-white text-sm">Discord Token &amp; Gizli Ortam Değişkenleri (.env)</h4>
            <p className="text-xs text-zinc-400">Girdiğiniz gerçek `DISCORD_TOKEN` bot sürecine doğrudan aktarılır.</p>
          </div>
          <div className="flex gap-2">
            <AnimatedButton size="xs" variant="secondary" onClick={() => setShowToken((v) => !v)}>
              {showToken ? 'Gizle' : 'Göster'}
            </AnimatedButton>
            <AnimatedButton size="xs" variant="emerald" onClick={saveEnv}>Kaydet</AnimatedButton>
          </div>
        </div>

        <div className="space-y-2">
          {Object.entries(envObj).map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-4 px-3 py-2 rounded-xl bg-[#09090b] font-mono text-xs text-amber-400 border border-white/[0.06]">{k}</div>
              <input
                type={k.includes('TOKEN') || k.includes('SECRET') || k.includes('KEY') ? (showToken ? 'text' : 'password') : 'text'}
                value={v}
                onChange={(e) => setEnvObj((prev) => ({ ...prev, [k]: e.target.value }))}
                className="sm:col-span-7 px-3 py-2 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-white"
              />
              <button
                onClick={() => {
                  const next = { ...envObj };
                  delete next[k];
                  setEnvObj(next);
                }}
                className="sm:col-span-1 text-xs text-rose-400 hover:text-rose-300"
              >
                Sil
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value.toUpperCase())}
            placeholder="YENİ_ANAHTAR"
            className="px-3 py-2 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-white"
          />
          <input
            value={newVal}
            onChange={(e) => setNewVal(e.target.value)}
            placeholder="Değer"
            className="flex-1 min-w-[160px] px-3 py-2 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-white"
          />
          <AnimatedButton
            size="xs"
            onClick={() => {
              if (!newKey.trim()) return;
              setEnvObj((p) => ({ ...p, [newKey.trim()]: newVal }));
              setNewKey('');
              setNewVal('');
            }}
          >
            Ekle
          </AnimatedButton>
        </div>
      </div>

      {/* Package Installer + Templates */}
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <h4 className="font-bold text-white text-sm">Paket Kurucu (npm / pip) &amp; Başlangıç Şablonları</h4>
        <div className="flex flex-wrap gap-2.5">
          <AnimatedButton size="sm" loading={installing} onClick={() => runInstall('install-discordjs')}>
            discord.js + dotenv Kur (1-Tık)
          </AnimatedButton>
          <AnimatedButton size="sm" variant="secondary" loading={installing} onClick={() => runInstall('npm-install')}>
            npm install
          </AnimatedButton>
          <AnimatedButton size="sm" variant="secondary" loading={installing} onClick={() => runInstall('pip-install')}>
            pip install -r requirements.txt
          </AnimatedButton>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={() => applyTemplate('bot-discordjs-v14')}
            className="p-4 rounded-xl bg-[#09090b] border border-white/[0.08] hover:border-amber-500/40 text-left transition"
          >
            <div className="font-bold text-white text-xs">Discord.js v14 Başlangıç Botu</div>
            <div className="text-[11px] text-zinc-400 mt-1">Hazır `!ping` komutu ve Node.js altyapısı uygula.</div>
          </button>
          <button
            type="button"
            onClick={() => applyTemplate('bot-python-py')}
            className="p-4 rounded-xl bg-[#09090b] border border-white/[0.08] hover:border-amber-500/40 text-left transition"
          >
            <div className="font-bold text-white text-xs">Python discord.py Başlangıç Botu</div>
            <div className="text-[11px] text-zinc-400 mt-1">`bot.py` async başlangıç kodu uygula.</div>
          </button>
        </div>
      </div>
    </div>
  );
}
