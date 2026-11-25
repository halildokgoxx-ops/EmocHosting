import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { MotdDesignerTab } from './MotdDesignerTab';
import { MinecraftSoftwareTab } from './MinecraftSoftwareTab';
import { MinecraftModsPluginsTab } from './MinecraftModsPluginsTab';

export function MinecraftPanel({
  server,
  live,
  extra,
  onReload,
  activeSection = 'minecraft',
  onSelectSection,
}) {
  const toast = useToast();
  const [eulaAccepted, setEulaAccepted] = useState(Boolean(extra?.eulaAccepted));
  const [props, setProps] = useState({});
  const [rawProps, setRawProps] = useState('');
  const [rawMode, setRawMode] = useState(false);

  const [lists, setLists] = useState({ ops: [], whitelist: [], bannedPlayers: [], bannedIps: [] });
  const [newPlayerName, setNewPlayerName] = useState('');
  const [opLevel, setOpLevel] = useState(4);

  const [worlds, setWorlds] = useState([]);
  const [jvmFlagsStr, setJvmFlagsStr] = useState((server.config?.jvmFlags || ['-XX:+UseG1GC']).join(' '));
  const [autoRestart, setAutoRestart] = useState(Boolean(server.config?.autoRestart));

  useEffect(() => {
    setEulaAccepted(Boolean(extra?.eulaAccepted));
  }, [extra]);

  const loadPlayers = useCallback(() => {
    apiRequest(`/api/servers/${server.id}/mc/players-lists`).then(setLists).catch(() => {});
  }, [server.id]);

  useEffect(() => {
    if (activeSection === 'settings') {
      apiRequest(`/api/servers/${server.id}/mc/properties`)
        .then((d) => {
          setProps(d.properties || {});
          setRawProps(d.raw || '');
        })
        .catch(() => {});
    } else if (activeSection === 'players' || activeSection === 'minecraft') {
      loadPlayers();
    } else if (activeSection === 'worlds') {
      apiRequest(`/api/servers/${server.id}/mc/worlds`).then((d) => setWorlds(d.worlds || [])).catch(() => {});
    }
  }, [activeSection, server.id, loadPlayers]);

  async function toggleEula(val) {
    await apiRequest(`/api/servers/${server.id}/mc/eula`, { method: 'POST', body: { accepted: val } });
    setEulaAccepted(val);
    toast.success(val ? 'Minecraft EULA onaylandı!' : 'EULA onayı kapatıldı');
  }

  async function saveProperties() {
    await apiRequest(`/api/servers/${server.id}/mc/properties`, {
      method: 'POST',
      body: rawMode ? { raw: rawProps } : { properties: props },
    });
    toast.success('server.properties kaydedildi!');
  }

  async function addPlayerWithUuid(listName) {
    const username = newPlayerName.trim();
    if (!username) return;
    try {
      const res = await apiRequest(`/api/servers/${server.id}/mc/players-lists/add`, {
        method: 'POST',
        body: { listName, username, level: opLevel },
      });
      const keyMap = { 'ops.json': 'ops', 'whitelist.json': 'whitelist', 'banned-players.json': 'bannedPlayers' };
      setLists((prev) => ({ ...prev, [keyMap[listName]]: res.items }));
      setNewPlayerName('');
      toast.success(`${username} (${res.officialUuid ? 'Mojang UUID' : 'Offline UUID'}) eklendi!`);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function removeListEntry(listName, idx) {
    const keyMap = { 'ops.json': 'ops', 'whitelist.json': 'whitelist', 'banned-players.json': 'bannedPlayers' };
    const key = keyMap[listName];
    const next = (lists[key] || []).filter((_, i) => i !== idx);
    await apiRequest(`/api/servers/${server.id}/mc/players-lists`, { method: 'POST', body: { listName, items: next } });
    setLists((prev) => ({ ...prev, [key]: next }));
  }

  async function resetWorld(worldName) {
    if (!window.confirm(`${worldName} klasörü tamamen silinip sıfırlansın mı?`)) return;
    try {
      await apiRequest(`/api/servers/${server.id}/mc/worlds/reset`, { method: 'POST', body: { worldName } });
      toast.success(`${worldName} sıfırlandı!`);
      apiRequest(`/api/servers/${server.id}/mc/worlds`).then((d) => setWorlds(d.worlds || []));
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function saveJvmFlags() {
    const flags = jvmFlagsStr.split(/\s+/).filter(Boolean);
    await apiRequest(`/api/servers/${server.id}/mc/flags`, { method: 'POST', body: { jvmFlags: flags, autoRestart } });
    toast.success('JVM & Kurtarma ayarları kaydedildi');
    onReload();
  }

  if (activeSection === 'versions') {
    return <MinecraftSoftwareTab server={server} extra={extra} onReload={onReload} />;
  }

  if (activeSection === 'plugins') {
    return <MinecraftModsPluginsTab server={server} defaultMode="plugin" onReload={onReload} />;
  }

  if (activeSection === 'mods') {
    return <MinecraftModsPluginsTab server={server} defaultMode="mod" onReload={onReload} />;
  }

  if (activeSection === 'motd') {
    return (
      <div className="glass-panel rounded-2xl p-5">
        <MotdDesignerTab server={server} initialMotd={extra?.motd} hasIcon={extra?.hasIcon} onSaved={onReload} />
      </div>
    );
  }

  if (activeSection === 'players') {
    return (
      <div className="glass-panel rounded-2xl p-5 space-y-5">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Oyuncu, OP Yetkilendirme &amp; Ban Listeleri</h2>
          <p className="text-xs text-zinc-400">Kullanıcı adına göre otomatik resmi Mojang/Offline UUID hesaplanır.</p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={newPlayerName}
            onChange={(e) => setNewPlayerName(e.target.value)}
            placeholder="Minecraft Oyuncu Adı..."
            className="flex-1 min-w-[200px] px-3.5 py-2 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none text-xs text-white"
          />
          <select
            value={opLevel}
            onChange={(e) => setOpLevel(Number(e.target.value))}
            className="px-3 py-2 rounded-xl bg-[#09090b] border border-white/10 text-xs text-white"
          >
            <option value={4}>OP Seviye 4 (Tam Yetki)</option>
            <option value={3}>OP Seviye 3 (Moderasyon)</option>
            <option value={2}>OP Seviye 2 (Komutlar)</option>
            <option value={1}>OP Seviye 1 (Spawn)</option>
          </select>
          <AnimatedButton size="xs" variant="emerald" onClick={() => addPlayerWithUuid('ops.json')}>+ Admin (OP)</AnimatedButton>
          <AnimatedButton size="xs" variant="secondary" onClick={() => addPlayerWithUuid('whitelist.json')}>+ Whitelist</AnimatedButton>
          <AnimatedButton size="xs" variant="danger" onClick={() => addPlayerWithUuid('banned-players.json')}>+ Banla</AnimatedButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { title: 'Sunucu Adminleri (ops.json)', file: 'ops.json', items: lists.ops || [] },
            { title: 'Whitelist (whitelist.json)', file: 'whitelist.json', items: lists.whitelist || [] },
            { title: 'Yasaklı Oyuncular (banned)', file: 'banned-players.json', items: lists.bannedPlayers || [] },
          ].map((col) => (
            <div key={col.file} className="p-4 rounded-xl bg-[#09090b] border border-white/[0.06] space-y-2.5">
              <h4 className="font-bold text-xs text-amber-400">{col.title}</h4>
              {col.items.length === 0 ? (
                <div className="text-xs text-zinc-500">Kayıt yok.</div>
              ) : (
                col.items.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs bg-zinc-900 px-3 py-2 rounded-lg">
                    <div className="min-w-0">
                      <div className="font-mono text-white font-bold truncate">
                        {p.name} {p.level ? `(Lv.${p.level})` : ''}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{p.uuid}</div>
                    </div>
                    <button onClick={() => removeListEntry(col.file, idx)} className="text-rose-400 hover:text-rose-300 shrink-0 ml-2">
                      Sil
                    </button>
                  </div>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === 'worlds') {
    return (
      <div className="glass-panel rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Dünyalar Yönetimi</h2>
          <p className="text-xs text-zinc-400">Overworld, Nether ve End boyutlarının disk kullanımı ve sıfırlama aracı.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {worlds.map((w) => (
            <div key={w.name} className="p-4 rounded-xl bg-[#09090b] border border-white/[0.07] space-y-2.5">
              <div className="font-bold text-white text-sm">{w.name}</div>
              <div className="text-xs font-mono text-emerald-400">{w.exists ? `${w.sizeMb} MB` : 'Henüz oluşmadı'}</div>
              <AnimatedButton size="xs" variant="danger" onClick={() => resetWorld(w.name)}>
                Dünyayı Sıfırla
              </AnimatedButton>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (activeSection === 'settings') {
    return (
      <div className="space-y-5">
        <div className="glass-panel rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold text-white">Sunucu Ayarları (`server.properties`)</h3>
              <button onClick={() => setRawMode((v) => !v)} className="text-xs text-amber-400 underline mt-0.5">
                {rawMode ? 'Görsel Form Editörüne Geç' : 'Ham server.properties Düzenle'}
              </button>
            </div>
            <AnimatedButton size="sm" variant="emerald" onClick={saveProperties}>
              Ayarları Kaydet
            </AnimatedButton>
          </div>
          {rawMode ? (
            <textarea
              rows={15}
              value={rawProps}
              onChange={(e) => setRawProps(e.target.value)}
              className="w-full p-4 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-zinc-200"
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {[
                { key: 'motd', label: 'MOTD' },
                { key: 'max-players', label: 'Max Oyuncu' },
                { key: 'gamemode', label: 'Oyun Modu' },
                { key: 'difficulty', label: 'Zorluk' },
                { key: 'pvp', label: 'PvP (true/false)' },
                { key: 'online-mode', label: 'Online Mode (true/false)' },
                { key: 'white-list', label: 'Whitelist (true/false)' },
                { key: 'view-distance', label: 'View Distance' },
                { key: 'simulation-distance', label: 'Simulation Distance' },
                { key: 'enable-command-block', label: 'Komut Bloğu' },
                { key: 'allow-nether', label: 'Nether' },
                { key: 'spawn-protection', label: 'Spawn Koruma' },
                { key: 'level-seed', label: 'World Seed' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="text-[11px] text-zinc-400 block mb-1">{f.label}</label>
                  <input
                    value={props[f.key] ?? ''}
                    onChange={(e) => setProps((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-xl bg-[#09090b] border border-white/10 text-xs text-white font-mono"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-5 space-y-3">
          <h4 className="font-bold text-sm text-white">JVM Başlatma Bayrakları &amp; Watchdog</h4>
          <input
            value={jvmFlagsStr}
            onChange={(e) => setJvmFlagsStr(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-[#09090b] border border-white/10 font-mono text-xs text-amber-300"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={autoRestart} onChange={(e) => setAutoRestart(e.target.checked)} />
              <span>Çökme durumunda otomatik yeniden başlat (Watchdog)</span>
            </label>
            <AnimatedButton size="xs" variant="emerald" onClick={saveJvmFlags}>
              JVM Ayarını Kaydet
            </AnimatedButton>
          </div>
        </div>
      </div>
    );
  }

  // Default: 'minecraft' section
  const mcInfo = live?.mcInfo;
  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-white">Minecraft Sunucu Kontrol Merkezi</h2>
          <p className="text-xs text-zinc-400">
            Çekirdek: <strong className="text-amber-400 uppercase">{extra?.hasJar ? `${server.config?.mcEngine || 'paper'} ${server.config?.mcVersion || ''}` : 'Kurulmadı'}</strong> • EULA:{' '}
            <strong className={eulaAccepted ? 'text-emerald-400' : 'text-rose-400'}>
              {eulaAccepted ? 'Onaylı' : 'Onay Bekliyor'}
            </strong>
          </p>
        </div>
        <AnimatedButton size="sm" variant={eulaAccepted ? 'emerald' : 'warning'} onClick={() => toggleEula(!eulaAccepted)}>
          {eulaAccepted ? 'EULA Onaylı' : 'EULA Onayla'}
        </AnimatedButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {[
          { label: 'Yazılım & Sürüm', desc: '17 çekirdek arasından değiştir', target: 'versions' },
          { label: 'Eklentiler (Plugins)', desc: 'Modrinth & CurseForge yükleyici', target: 'plugins' },
          { label: 'Modlar & Paketler', desc: 'Forge, NeoForge, Fabric modları', target: 'mods' },
          { label: 'Oyuncu & OP', desc: `${lists.ops?.length || 0} OP • ${lists.whitelist?.length || 0} Whitelist`, target: 'players' },
        ].map((card) => (
          <button
            key={card.target}
            type="button"
            onClick={() => onSelectSection?.(card.target)}
            className="glass-panel rounded-2xl p-4 text-left hover:border-amber-500/40 transition space-y-1.5"
          >
            <div className="font-display font-bold text-sm text-white">{card.label}</div>
            <div className="text-xs text-zinc-400">{card.desc}</div>
          </button>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div>
          <span className="text-zinc-400">Canlı Minecraft Query:</span>{' '}
          {mcInfo?.online ? (
            <strong className="text-emerald-400 font-mono">
              Çevrimiçi • {mcInfo.playersOnline}/{mcInfo.playersMax} Oyuncu • {mcInfo.latencyMs}ms
            </strong>
          ) : (
            <span className="text-zinc-500 font-mono">Sunucu kapalı veya açılış bekliyor</span>
          )}
        </div>
        <button type="button" onClick={() => onSelectSection?.('network')} className="text-amber-400 hover:underline font-semibold">
          Ping &amp; Alan Adı Ayarları →
        </button>
      </div>
    </div>
  );
}
