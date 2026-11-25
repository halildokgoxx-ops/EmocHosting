import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { TrashIcon, SearchGlassIcon } from '../icons/EmoIcons';

const CATEGORIES = [
  { id: 'popular', label: 'Popüler' },
  { id: 'performance', label: 'Performans' },
  { id: 'technology', label: 'Teknoloji' },
  { id: 'adventure', label: 'Macera' },
  { id: 'magic', label: 'Büyü' },
  { id: 'worldgen', label: 'Dünya Üretimi' },
  { id: 'decoration', label: 'Dekorasyon' },
  { id: 'utility', label: 'Araçlar' },
  { id: 'storage', label: 'Depolama' },
  { id: 'mobs', label: 'Yaratıklar' },
  { id: 'food', label: 'Yemek' },
];

export function MinecraftModsPluginsTab({ server, defaultMode = 'mod', onReload }) {
  const toast = useToast();
  const [subTab, setSubTab] = useState('discover'); // 'discover' | 'installed' | 'updates' | 'modpacks'
  const [source, setSource] = useState('all'); // 'all' | 'modrinth' | 'curseforge'
  const [category, setCategory] = useState('popular');
  const [compatibleOnly, setCompatibleOnly] = useState(true);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [installingId, setInstallingId] = useState('');
  const [installed, setInstalled] = useState({ plugins: [], mods: [], datapacks: [] });

  const effectiveType = subTab === 'modpacks' ? 'modpack' : defaultMode;
  const activeFolder =
    subTab === 'modpacks' ? 'modpacks' : defaultMode === 'mod' ? 'mods' : 'plugins';
  const activeInstalledList = defaultMode === 'mod' ? installed.mods : installed.plugins;

  const loadInstalled = useCallback(() => {
    apiRequest(`/api/servers/${server.id}/mc/installed`).then(setInstalled).catch(() => {});
  }, [server.id]);

  const performSearch = useCallback(
    async (overrideType = effectiveType) => {
      setLoadingSearch(true);
      try {
        const params = new URLSearchParams({
          q: query || (overrideType === 'plugin' ? 'essentials' : overrideType === 'modpack' ? 'rlcraft' : ''),
          type: overrideType,
          source,
          category,
        });
        if (compatibleOnly) {
          if (server.config?.mcVersion) params.set('version', server.config.mcVersion);
          if (server.config?.mcEngine && overrideType !== 'modpack') {
            params.set('loader', server.config.mcEngine);
          }
        }
        const data = await apiRequest(`/api/servers/mc/plugins/search?${params.toString()}`);
        setHits(data.hits || []);
      } catch (err) {
        toast.error(err.message);
      } finally {
        setLoadingSearch(false);
      }
    },
    [effectiveType, query, source, category, compatibleOnly, server.config?.mcVersion, server.config?.mcEngine, toast]
  );

  useEffect(() => {
    loadInstalled();
  }, [loadInstalled]);

  useEffect(() => {
    if (subTab === 'discover' || subTab === 'modpacks') {
      performSearch(subTab === 'modpacks' ? 'modpack' : defaultMode);
    }
  }, [subTab, source, category, compatibleOnly, defaultMode]);

  async function installItem(item) {
    setInstallingId(`${item.source}:${item.id}`);
    try {
      const res = await apiRequest(`/api/servers/${server.id}/mc/plugins/install`, {
        method: 'POST',
        body: {
          projectId: item.id,
          source: item.source,
          type: effectiveType,
          version: server.config?.mcVersion || '',
          loader: server.config?.mcEngine || '',
        },
      });
      toast.success(`${item.title} (${res.source}) -> ${res.folder}/${res.filename} kuruldu!`);
      loadInstalled();
      onReload?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setInstallingId('');
    }
  }

  async function toggleInstalled(folder, filename) {
    try {
      await apiRequest(`/api/servers/${server.id}/mc/installed/toggle`, {
        method: 'POST',
        body: { folder, filename },
      });
      loadInstalled();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function deleteInstalled(folder, filename) {
    try {
      await apiRequest(
        `/api/servers/${server.id}/mc/installed?folder=${encodeURIComponent(folder)}&filename=${encodeURIComponent(filename)}`,
        { method: 'DELETE' }
      );
      loadInstalled();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header Box (Screenshot #1) */}
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h2 className="font-display text-lg sm:text-xl font-bold text-white">
            {defaultMode === 'plugin' ? 'Eklentiler' : 'Modlar'}
          </h2>
          <p className="text-xs text-zinc-400">
            Sunucuna {defaultMode === 'plugin' ? 'eklenti' : 'mod'} ekle. Modrinth ve CurseForge depolarından doğrudan kur.
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#09090b] border border-white/[0.08] text-xs font-mono text-zinc-300">
            <span className="text-amber-400 font-bold">
              {(server.config?.mcEngine || 'Paper').toUpperCase()} {server.config?.mcVersion || '1.21.4'}
            </span>
            <span className="text-zinc-500">Yazılım</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Row (Keşfet | Kurulu N | Güncellemeler | Mod Paketleri) */}
      <div className="inline-flex flex-wrap p-1 rounded-xl bg-[#111216] border border-white/[0.08] gap-1">
        {[
          { id: 'discover', label: 'Keşfet' },
          { id: 'installed', label: 'Kurulu', count: activeInstalledList?.length || 0 },
          { id: 'updates', label: 'Güncellemeler' },
          { id: 'modpacks', label: 'Mod paketleri' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
              subTab === t.id ? 'bg-white/[0.1] text-white' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] font-mono text-zinc-300">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {(subTab === 'discover' || subTab === 'modpacks') && (
        <>
          {/* Search + Source Selector (Tümü | Modrinth | CurseForge) */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              performSearch();
            }}
            className="flex flex-col md:flex-row gap-2.5"
          >
            <div className="relative flex-1">
              <SearchGlassIcon className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  defaultMode === 'plugin'
                    ? 'Eklenti ara: EssentialsX, LuckPerms, Vault, WorldEdit...'
                    : 'Mod ara: Lithium, Create, JEI, Geckolib, Chunky...'
                }
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111216] border border-white/[0.08] focus:border-amber-500 outline-none text-xs text-white placeholder:text-zinc-500"
              />
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#111216] border border-white/[0.08] shrink-0">
              {[
                { id: 'all', label: 'Tümü' },
                { id: 'modrinth', label: 'Modrinth' },
                { id: 'curseforge', label: 'CurseForge' },
              ].map((src) => (
                <button
                  key={src.id}
                  type="button"
                  onClick={() => setSource(src.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    source === src.id ? 'bg-white/[0.12] text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {src.label}
                </button>
              ))}
            </div>

            <AnimatedButton type="submit" size="sm" loading={loadingSearch}>
              Ara
            </AnimatedButton>
          </form>

          {/* Category Filter Chips + Compatible Toggle (Screenshot #1) */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                    category === c.id
                      ? 'bg-white/[0.1] border-white/25 text-white'
                      : 'bg-[#111216] border-white/[0.06] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={compatibleOnly}
                onChange={(e) => setCompatibleOnly(e.target.checked)}
                className="rounded border-white/20 bg-zinc-900 text-amber-500 focus:ring-amber-500"
              />
              <span>Sadece uyumlu</span>
            </label>
          </div>

          {/* Grid of Content Cards */}
          {loadingSearch ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="glass-panel rounded-2xl h-44 animate-pulse" />
              ))}
            </div>
          ) : hits.length === 0 ? (
            <div className="glass-panel rounded-2xl p-10 text-center text-xs text-zinc-400">
              Seçili filtrelerde sonuç bulunamadı. &quot;Sadece uyumlu&quot; seçeneğini kapatıp tekrar arayabilirsiniz.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {hits.map((h) => {
                const key = `${h.source}:${h.id}`;
                const busy = installingId === key;
                return (
                  <div
                    key={key}
                    className="rounded-2xl bg-[#111216] border border-white/[0.07] hover:border-amber-500/35 p-4 flex flex-col justify-between gap-3.5 transition"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        {h.iconUrl ? (
                          <img
                            src={h.iconUrl}
                            alt={`${h.title || (defaultMode === 'plugin' ? 'Eklenti' : 'Mod')} ikonu`}
                            width={44}
                            height={44}
                            loading="lazy"
                            decoding="async"
                            className="w-11 h-11 rounded-xl object-cover bg-zinc-900 border border-white/[0.08]"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-zinc-900 border border-white/[0.08] flex items-center justify-center text-xs font-bold text-zinc-400">
                            {h.title?.[0]}
                          </div>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            h.source === 'curseforge'
                              ? 'bg-orange-500/15 border-orange-500/30 text-orange-300'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          }`}
                        >
                          {h.source === 'curseforge' ? 'CurseForge' : 'Modrinth'}
                        </span>
                      </div>

                      <div>
                        <h4 className="font-display font-bold text-sm text-white line-clamp-1">{h.title}</h4>
                        <div className="text-[11px] text-zinc-500">
                          {h.author} • {Number(h.downloads || 0).toLocaleString()} indirme
                        </div>
                      </div>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{h.description}</p>
                    </div>

                    <AnimatedButton
                      size="xs"
                      variant="secondary"
                      loading={busy}
                      onClick={() => installItem(h)}
                      className="w-full"
                    >
                      Tek Tıkla Kur ({activeFolder}/)
                    </AnimatedButton>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {(subTab === 'installed' || subTab === 'updates') && (
        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              Kurulu {defaultMode === 'plugin' ? 'Eklentiler' : 'Modlar'} ({activeFolder}/)
            </h3>
            <span className="text-xs text-zinc-400">{activeInstalledList?.length || 0} dosya</span>
          </div>

          {!activeInstalledList || activeInstalledList.length === 0 ? (
            <p className="text-xs text-zinc-500 py-8 text-center">
              Henüz kurulu dosya yok. &quot;Keşfet&quot; sekmesinden saniyeler içinde yükleyebilirsiniz.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {activeInstalledList.map((item) => (
                <div key={item.filename} className="px-3.5 py-2.5 rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className={`font-mono truncate ${item.enabled ? 'text-white' : 'text-zinc-500 line-through'}`}>
                      {item.filename}
                    </div>
                    <div className="text-[11px] text-zinc-500">{item.sizeKb} KB</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleInstalled(activeFolder, item.filename)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                        item.enabled ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'
                      }`}
                    >
                      {item.enabled ? 'Devre Dışı Bırak' : 'Aktifle'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteInstalled(activeFolder, item.filename)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
