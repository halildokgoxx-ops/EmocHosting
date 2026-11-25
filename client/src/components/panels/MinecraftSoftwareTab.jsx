import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { UploadIcon } from '../icons/EmoIcons';

const ENGINE_STYLE = {
  emoccore: { accent: '#f59e0b', glyph: 'EC' },
  paper: { accent: '#e4e4e7', glyph: 'PP' },
  purpur: { accent: '#a855f7', glyph: 'PR' },
  fabric: { accent: '#d6b88d', glyph: 'FB' },
  forge: { accent: '#ea580c', glyph: 'FG' },
  neoforge: { accent: '#f97316', glyph: 'NF' },
  vanilla: { accent: '#22c55e', glyph: 'VN' },
  velocity: { accent: '#38bdf8', glyph: 'VL' },
  leaf: { accent: '#4ade80', glyph: 'LF' },
  folia: { accent: '#eab308', glyph: 'FL' },
  leaves: { accent: '#34d399', glyph: 'LV' },
  spigot: { accent: '#f59e0b', glyph: 'SP' },
  bukkit: { accent: '#fb923c', glyph: 'BK' },
  quilt: { accent: '#818cf8', glyph: 'QL' },
  mohist: { accent: '#ec4899', glyph: 'MH' },
  arclight: { accent: '#60a5fa', glyph: 'AR' },
  bungeecord: { accent: '#facc15', glyph: 'BC' },
};

export function MinecraftSoftwareTab({ server, extra, onReload }) {
  const toast = useToast();
  const [catalog, setCatalog] = useState([]);
  const [selectedEngine, setSelectedEngine] = useState(null);
  const [engineVersions, setEngineVersions] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [installingVer, setInstallingVer] = useState('');
  const [eulaAccepted, setEulaAccepted] = useState(Boolean(extra?.eulaAccepted));
  const [uploadingJar, setUploadingJar] = useState(false);

  const installedEngine = (server.config?.mcEngine || '').toLowerCase();
  const installedVersion = server.config?.mcVersion || '';

  useEffect(() => {
    setEulaAccepted(Boolean(extra?.eulaAccepted));
  }, [extra]);

  useEffect(() => {
    apiRequest('/api/servers/mc/versions')
      .then((d) => {
        if (Array.isArray(d.catalog)) setCatalog(d.catalog);
      })
      .catch(() => {});
  }, []);

  async function selectSoftwareCard(item) {
    setSelectedEngine(item);
    setLoadingVersions(true);
    setEngineVersions([]);
    try {
      const data = await apiRequest(`/api/servers/mc/versions?engine=${encodeURIComponent(item.id)}`);
      setEngineVersions(data.versions || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoadingVersions(false);
    }
  }

  async function installSpecificVersion(ver) {
    if (!selectedEngine) return;
    setInstallingVer(ver);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/mc/install-version`, {
        method: 'POST',
        body: { engine: selectedEngine.id, version: ver },
      });
      toast.success(`${selectedEngine.name} ${ver} kuruldu (${res.sizeMb} MB)!`);
      setSelectedEngine(null);
      onReload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInstallingVer('');
    }
  }

  async function toggleEula(val) {
    await apiRequest(`/api/servers/${server.id}/mc/eula`, { method: 'POST', body: { accepted: val } });
    setEulaAccepted(val);
    toast.success(val ? 'Mojang Minecraft EULA onaylandı!' : 'EULA onayı kapatıldı');
  }

  async function uploadCustomJar(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingJar(true);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/mc/upload-jar`, {
        method: 'POST',
        body: fd,
        isFormData: true,
      });
      toast.success(`Özel server.jar yüklendi (${res.sizeMb} MB)`);
      onReload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingJar(false);
    }
  }

  const featuredCore = catalog.find((c) => c.id === 'emoccore');
  const gridCores = catalog.filter((c) => c.id !== 'emoccore');

  return (
    <div className="space-y-5">
      {/* Header Card (SS4 Style) */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Sürüm &amp; Yazılım</h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Sunucunun çalıştıracağı yazılımı ve Minecraft sürümünü seç. Dünyan, eklentilerin ve ayarların korunur.
          </p>
        </div>
        <AnimatedButton size="sm" variant={eulaAccepted ? 'emerald' : 'warning'} onClick={() => toggleEula(!eulaAccepted)}>
          {eulaAccepted ? 'Mojang EULA Onaylı' : 'Mojang EULA Onayla'}
        </AnimatedButton>
      </div>

      {/* ŞU AN ÇALIŞAN Status Card (SS4 Style) */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#09090b] border border-white/10 flex items-center justify-center font-mono text-xs font-black text-amber-400">
            {(ENGINE_STYLE[installedEngine]?.glyph) || 'MC'}
          </div>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Şu An Kurulu</div>
            <div className="font-display text-base font-bold text-white">
              {extra?.hasJar
                ? `${(catalog.find((c) => c.id === installedEngine)?.name || installedEngine || 'Paper')} ${installedVersion}`
                : 'Henüz çekirdek kurulmadı'}
            </div>
            <div className="text-xs text-zinc-400">
              {extra?.hasJar
                ? 'Aşağıdaki kartlardan tek tıkla çekirdek veya sürüm değiştirebilirsiniz.'
                : 'Başlamak için EmoçCore veya diğer çekirdeklerden birini seçin.'}
            </div>
          </div>
        </div>
        {extra?.hasJar && (
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
            Hazır
          </span>
        )}
      </div>

      {/* Yazılım Seç Card Container (SS2 & SS4 Style) */}
      <div className="glass-panel rounded-2xl p-5 space-y-5">
        <div>
          <h3 className="font-display text-base font-bold text-white">Yazılım Seç</h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Ne yapmak istediğine göre seç. Emin değilsen EmoçCore veya Paper ile başla.
          </p>
        </div>

        {/* Featured EmoçCore Banner Card */}
        {featuredCore && (
          <div
            onClick={() => selectSoftwareCard(featuredCore)}
            className={`cursor-pointer rounded-2xl p-5 border transition bg-gradient-to-r from-amber-500/[0.12] via-[#171411] to-[#121318] flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
              installedEngine === 'emoccore' ? 'border-emerald-400/50' : 'border-amber-500/35 hover:border-amber-400/70'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center shrink-0">
                <span className="font-display font-black text-amber-400 text-base">EC</span>
              </div>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display font-bold text-white text-base">{featuredCore.name}</span>
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                    Önerilen
                  </span>
                  {installedEngine === 'emoccore' && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      • Kurulu
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold text-amber-400/90">{featuredCore.tagline}</div>
                <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">{featuredCore.description}</p>
              </div>
            </div>
            <div className="flex flex-wrap lg:flex-col items-start lg:items-end gap-1.5 shrink-0">
              {(featuredCore.tags || []).map((t) => (
                <span key={t} className="px-2.5 py-1 rounded-lg bg-[#09090b]/80 border border-white/[0.08] text-[11px] text-zinc-300">
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 16-Core Visual Grid (SS2 Style - NO Select Dropdowns!) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {gridCores.map((item) => {
            const st = ENGINE_STYLE[item.id] || { accent: '#a1a1aa', glyph: item.name.slice(0, 2).toUpperCase() };
            const isInstalled = installedEngine === item.id && extra?.hasJar;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectSoftwareCard(item)}
                className={`text-left p-4 rounded-xl border transition group flex flex-col justify-between gap-3 min-h-[126px] ${
                  isInstalled
                    ? 'bg-emerald-500/[0.06] border-emerald-500/40'
                    : 'bg-[#0b0c10] border-white/[0.07] hover:border-amber-500/45 hover:bg-[#13141a]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <div
                    className="w-10 h-10 rounded-lg border border-white/10 flex items-center justify-center font-mono text-xs font-extrabold shrink-0"
                    style={{ backgroundColor: `${st.accent}16`, color: st.accent }}
                  >
                    {st.glyph}
                  </div>
                  {isInstalled && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      • Kurulu
                    </span>
                  )}
                </div>
                <div>
                  <div className="font-display font-bold text-white text-sm group-hover:text-amber-300 transition">
                    {item.name}
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Custom JAR Upload Bar */}
        <div className="p-4 rounded-xl bg-[#09090b] border border-white/[0.07] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <div className="font-bold text-white">Özel `.jar` Yükle</div>
            <div className="text-zinc-400">Kendi özel derlediğiniz herhangi bir `server.jar` dosyasını yükleyin.</div>
          </div>
          <label className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/10 text-zinc-100 text-xs font-semibold transition">
            <UploadIcon className="w-4 h-4 text-amber-400" />
            <span>{uploadingJar ? 'Yükleniyor...' : 'Özel .JAR Seç'}</span>
            <input type="file" accept=".jar" className="hidden" onChange={uploadCustomJar} disabled={uploadingJar} />
          </label>
        </div>
      </div>

      {/* Version Picker Modal for Clicked Card */}
      {selectedEngine && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !installingVer && setSelectedEngine(null)}
        >
          <div
            className="glass-panel max-w-xl w-full rounded-2xl p-6 space-y-4 border border-amber-500/35"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-xl font-bold text-white">{selectedEngine.name} Sürümleri</h3>
                <p className="text-xs text-zinc-400">{selectedEngine.description}</p>
              </div>
              <button
                type="button"
                onClick={() => !installingVer && setSelectedEngine(null)}
                className="px-3 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
              >
                Kapat
              </button>
            </div>

            {loadingVersions ? (
              <div className="py-10 text-center text-xs text-zinc-400">Canlı sürümler API&apos;den çekiliyor...</div>
            ) : engineVersions.length === 0 ? (
              <div className="py-8 text-center text-xs text-rose-400">Bu yazılım için sürüm listesi alınamadı.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {engineVersions.map((ver) => {
                  const isCurrent = installedEngine === selectedEngine.id && installedVersion === ver;
                  const busy = installingVer === ver;
                  return (
                    <button
                      key={ver}
                      type="button"
                      disabled={Boolean(installingVer)}
                      onClick={() => installSpecificVersion(ver)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-mono font-bold transition flex items-center justify-between ${
                        isCurrent
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-[#09090b] border-white/[0.08] hover:border-amber-500/50 text-zinc-200 hover:text-amber-300'
                      }`}
                    >
                      <span className="truncate">{ver}</span>
                      <span className="text-[10px] font-sans text-zinc-400 ml-1">
                        {busy ? '...' : isCurrent ? 'Kurulu' : 'Kur'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
