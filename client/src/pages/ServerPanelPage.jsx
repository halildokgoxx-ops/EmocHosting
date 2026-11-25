import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { apiRequest } from '../lib/api';
import { auth } from '../lib/firebase';
import { useToast } from '../context/ToastContext';
import { SeoHead } from '../components/seo/SeoHead';
import { AnimatedButton } from '../components/ui/AnimatedButton';
import { TelemetryChart } from '../components/ui/TelemetryChart';
import { MinecraftPanel } from '../components/panels/MinecraftPanel';
import { WebHostPanel } from '../components/panels/WebHostPanel';
import { DiscordBotPanel } from '../components/panels/DiscordBotPanel';
import { AltyapiPanel } from '../components/panels/AltyapiPanel';
import { LiveConsoleTab } from '../components/panels/LiveConsoleTab';
import { FileManagerTab } from '../components/panels/FileManagerTab';
import { BackupsTab } from '../components/panels/BackupsTab';
import { TasksTab } from '../components/panels/TasksTab';
import { SftpTab } from '../components/panels/SftpTab';
import { CollaboratorsTab } from '../components/panels/CollaboratorsTab';
import { NetworkPortsTab } from '../components/panels/NetworkPortsTab';
import { ActivityLogTab } from '../components/panels/ActivityLogTab';
import { AiAssistantTab } from '../components/panels/AiAssistantTab';
import { UpgradePlanTab } from '../components/panels/UpgradePlanTab';
import { LatestLogTab } from '../components/panels/LatestLogTab';
import {
  CategoryIcon,
  PowerPlayIcon,
  PowerStopIcon,
  PowerPauseIcon,
  RestartIcon,
  ConsoleTerminalIcon,
  PluginSparkIcon,
  SettingsGearIcon,
  PlayersGroupIcon,
  FolderIcon,
  BackupZipIcon,
  ClockScheduleIcon,
  SftpTransferIcon,
  CollaboratorsIcon,
  PaletteMotdIcon,
  WorldGlobeIcon,
  ModCubeIcon,
  TicketSupportIcon,
  CopyIcon,
  TrophyIcon,
} from '../components/icons/EmoIcons';

export function ServerPanelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [live, setLive] = useState({});
  const [history, setHistory] = useState([]);
  const [consoleLines, setConsoleLines] = useState([]);
  const [busy, setBusy] = useState('');
  const [section, setSection] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    try {
      const res = await apiRequest(`/api/servers/${id}`);
      setData(res);
      setLive(res.live || {});
      setHistory(Array.isArray(res.history) ? res.history : []);
      setConsoleLines(res.console || []);
    } catch (err) {
      toast.error(err.message);
      navigate('/servers');
    }
  }, [id, navigate, toast]);

  // StrictMode-safe Socket.IO subscription + deduplication by entry.id (fixes double-send!)
  useEffect(() => {
    loadDetail();
    let socket = null;
    let disposed = false;

    auth.currentUser?.getIdToken().then((token) => {
      if (disposed || !token) return;
      socket = io('/', { auth: { token } });
      socket.on('connect', () => {
        socket.emit('join:server', id);
      });
      socket.on('telemetry:server', (stat) => {
        if (stat.serverId !== id) return;
        setLive(stat);
        setHistory((prev) => [
          ...prev.slice(-29),
          {
            time: new Date().toLocaleTimeString('tr-TR', { hour12: false }),
            cpuPct: Number(stat.cpuPct || 0),
            ramUsedMb: Number(stat.ramUsedMb || 0),
            ramPct: Number(stat.ramPct || 0),
          },
        ]);
      });
      socket.on('server:status', ({ serverId, status }) => {
        if (serverId === id) setLive((p) => ({ ...p, status }));
      });
      socket.on('console:line', ({ serverId, entry }) => {
        if (serverId !== id || !entry) return;
        setConsoleLines((prev) => {
          if (entry.id && prev.some((x) => x.id === entry.id)) return prev;
          return [...prev.slice(-240), entry];
        });
      });
    });

    return () => {
      disposed = true;
      socket?.emit('leave:server', id);
      socket?.disconnect();
    };
  }, [id, loadDetail]);

  async function power(action) {
    setBusy(action);
    try {
      await apiRequest(`/api/servers/${id}/power`, { method: 'POST', body: { action } });
      toast.success(`Sunucu işlemi uygulandı: ${action.toUpperCase()}`);
      await loadDetail();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  }

  if (!data) {
    return (
      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 text-center text-zinc-400">
        Sunucu paneli yükleniyor...
      </div>
    );
  }

  const srv = data.server;
  const st = live.status || srv.status;
  const cpuPct = Number(live.cpuPct || 0);
  const ramPct = srv.allocatedRamMb ? Math.min(100, (Number(live.ramUsedMb || 0) / srv.allocatedRamMb) * 100) : 0;
  const diskPct = srv.allocatedDiskMb ? Math.min(100, (Number(live.diskUsedMb || 0) / srv.allocatedDiskMb) * 100) : 0;
  const domainAddr = srv.domainAddress || `${srv.subdomain || srv.slug}.emochost.com`;

  const menuGroups = [
    {
      title: 'GENEL',
      items: [
        { id: 'overview', label: 'Genel Bakış', icon: CategoryIcon },
        { id: 'console', label: 'Konsol', icon: ConsoleTerminalIcon },
        srv.category === 'minecraft'
          ? { id: 'minecraft', label: 'Minecraft', icon: CategoryIcon }
          : {
              id: 'product_main',
              label: srv.category === 'web' ? 'Website' : srv.category === 'discord' ? 'Discord Bot' : 'Altyapı',
              icon: CategoryIcon,
            },
      ],
    },
    ...(srv.category === 'minecraft'
      ? [
          {
            title: 'OYUN',
            items: [
              { id: 'versions', label: 'Sürüm & Yazılım', icon: PluginSparkIcon },
              { id: 'players', label: 'Oyuncular', icon: PlayersGroupIcon },
              { id: 'plugins', label: 'Eklentiler', icon: PluginSparkIcon },
              { id: 'mods', label: 'Modlar', icon: ModCubeIcon },
              { id: 'worlds', label: 'Dünyalar', icon: WorldGlobeIcon },
              { id: 'motd', label: 'MOTD & İkon', icon: PaletteMotdIcon },
            ],
          },
        ]
      : []),
    {
      title: 'DOSYALAR & YEDEK',
      items: [
        { id: 'files', label: 'Dosyalar', icon: FolderIcon },
        { id: 'sftp', label: 'SFTP Bilgileri', icon: SftpTransferIcon },
        { id: 'backups', label: 'Yedekler', icon: BackupZipIcon },
        { id: 'logs', label: 'Günlük', icon: ConsoleTerminalIcon },
      ],
    },
    {
      title: 'YÖNETİM',
      items: [
        { id: 'settings', label: 'Ayarlar', icon: SettingsGearIcon },
        { id: 'tasks', label: 'Zamanlanmış Görevler', icon: ClockScheduleIcon },
        { id: 'network', label: 'Ağ & Portlar', icon: WorldGlobeIcon },
        { id: 'collaborators', label: 'Yetkililer', icon: CollaboratorsIcon },
        { id: 'activity', label: 'Etkinlik Kaydı', icon: ClockScheduleIcon },
      ],
    },
    {
      title: 'YARDIM',
      items: [
        { id: 'ai', label: 'AI Asistanı', icon: PluginSparkIcon },
        { id: 'upgrade', label: 'Yükseltme / Düşürme', icon: TrophyIcon },
        { id: 'support', label: 'Destek Talebi Aç', icon: TicketSupportIcon, to: '/tickets' },
      ],
    },
  ];

  const statusMeta =
    st === 'running'
      ? { label: 'Çalışıyor', dot: 'bg-emerald-400', badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', sub: 'Sunucu şu anda çevrimiçi ve bağlantılara açık.' }
      : st === 'paused'
      ? { label: 'Uyuyor', dot: 'bg-sky-400', badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30', sub: 'Sunucu geçici uyku / duraklatılmış durumda.' }
      : st === 'suspended'
      ? { label: 'Askıda', dot: 'bg-rose-400', badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30', sub: 'Paket süresi dolduğu için askıya alındı.' }
      : { label: 'Kapalı', dot: 'bg-zinc-400', badge: 'bg-zinc-800 text-zinc-300 border-white/10', sub: 'Başlat düğmesine basarak sunucuyu anında başlatabilirsiniz.' };

  const SidebarContent = (
    <div className="flex flex-col h-full">
      {/* Sidebar Header (MENÜ + Collapse Button - SS1/SS3/SS4/SS5) */}
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-white/[0.06]">
        {!sidebarCollapsed && (
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-zinc-500 font-semibold">MENÜ</span>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-zinc-900 border border-white/[0.08] items-center justify-center text-zinc-400 hover:text-white"
          title="Menüyü Daralt/Genişlet"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Scrollable Groups */}
      <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
        {menuGroups.map((grp) => (
          <div key={grp.title} className="space-y-1">
            {!sidebarCollapsed && (
              <div className="px-2.5 pb-1 text-[10px] font-mono uppercase tracking-[0.18em] text-zinc-500">
                {grp.title}
              </div>
            )}
            {grp.items.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              if (item.to) {
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition"
                  >
                    <Icon category={srv.category} className="w-4 h-4 shrink-0" />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              }
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] font-medium transition text-left ${
                    active
                      ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/[0.06] border border-amber-500/35 text-amber-200'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <Icon category={srv.category} className={`w-4 h-4 shrink-0 ${active ? 'text-amber-400' : ''}`} />
                  {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Sidebar Bottom Upgrade Highlight + Ana Sayfa (SS3/SS4/SS5) */}
      <div className="p-2.5 border-t border-white/[0.07] space-y-2">
        <button
          type="button"
          onClick={() => {
            setSection('upgrade');
            setMobileMenuOpen(false);
          }}
          className="w-full p-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/35 text-left flex items-center justify-between gap-2 transition"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-lg bg-amber-500 text-zinc-950 font-black flex items-center justify-center text-xs shrink-0">
              ⚡
            </span>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <div className="text-xs font-bold text-white truncate">Yükseltme / Düşürme</div>
                <div className="text-[10px] text-amber-300/80 truncate">{srv.packageName}</div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && <span className="text-amber-400 text-xs">›</span>}
        </button>

        <Link
          to="/servers"
          className="w-full px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-white/[0.07] flex items-center justify-between text-xs font-medium text-zinc-300 transition"
        >
          <span>{sidebarCollapsed ? '←' : 'Hizmetlerim'}</span>
          {!sidebarCollapsed && <span>›</span>}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="relative z-10 max-w-[1440px] mx-auto px-3 sm:px-5 py-4 sm:py-6">
      <SeoHead title={`${srv.name} — Yönetim Paneli`} noIndex />

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        {/* Desktop Vertical Sidebar */}
        <aside
          className={`hidden lg:block shrink-0 sticky top-20 h-[calc(100vh-6rem)] rounded-2xl bg-[#111216]/95 border border-white/[0.08] overflow-hidden transition-all duration-200 ${
            sidebarCollapsed ? 'w-[68px]' : 'w-[244px]'
          }`}
        >
          {SidebarContent}
        </aside>

        {/* Mobile Menu Trigger Bar */}
        <div className="lg:hidden w-full flex items-center justify-between gap-2">
          <AnimatedButton size="sm" variant="secondary" onClick={() => setMobileMenuOpen((v) => !v)}>
            ☰ Panel Menüsü
          </AnimatedButton>
          <span className="text-xs font-mono text-amber-400">{domainAddr}</span>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden w-full rounded-2xl bg-[#111216] border border-white/[0.08] overflow-hidden">
            {SidebarContent}
          </div>
        )}

        {/* Right Main Content Column */}
        <div className="flex-1 min-w-0 w-full space-y-5">
          {/* Top Server Banner Header (SS1 & SS4 Inspired!) */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-r from-[#14151a] via-[#121318] to-[#181410] p-5 sm:p-6">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5">
              <div className="flex items-start sm:items-center gap-4 min-w-0">
                <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-[#09090b] border border-white/10 flex items-center justify-center shrink-0">
                  <CategoryIcon category={srv.category} className="w-7 h-7" />
                  <span className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#14151a] ${statusMeta.dot}`} />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="font-display text-xl sm:text-2xl font-extrabold text-white truncate">
                      {srv.name}
                    </h1>
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusMeta.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dot}`} />
                      {statusMeta.label}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400">{statusMeta.sub}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(domainAddr);
                        toast.success(`Alan adı kopyalandı: ${domainAddr}`);
                      }}
                      className="inline-flex items-center gap-1.5 font-mono text-zinc-300 hover:text-amber-400 transition"
                    >
                      <span>{domainAddr}</span>
                      <CopyIcon className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                    <span className="text-zinc-600">•</span>
                    <span className="font-mono text-zinc-500">Port: {srv.port}</span>
                  </div>
                </div>
              </div>

              {/* Inline Mini Metrics + Round Power Action Button (SS1/SS4) */}
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="grid grid-cols-3 gap-4 sm:gap-5 text-xs min-w-[230px]">
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">RAM</div>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {Math.round(live.ramUsedMb || 0)}M / {(srv.allocatedRamMb / 1024).toFixed(1)}G
                    </div>
                    <div className="h-1 bg-white/[0.08] rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${ramPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">CPU</div>
                    <div className="font-mono font-bold text-white mt-0.5">%{cpuPct}</div>
                    <div className="h-1 bg-white/[0.08] rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-emerald-400" style={{ width: `${Math.min(100, cpuPct)}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-mono text-zinc-500 uppercase">
                      {srv.category === 'minecraft' && live.mcInfo?.online ? 'OYUNCULAR' : 'DİSK'}
                    </div>
                    <div className="font-mono font-bold text-white mt-0.5">
                      {srv.category === 'minecraft' && live.mcInfo?.online
                        ? `${live.mcInfo.playersOnline}/${live.mcInfo.playersMax}`
                        : `${Math.round(live.diskUsedMb || 0)} MB`}
                    </div>
                    <div className="h-1 bg-white/[0.08] rounded-full mt-1.5 overflow-hidden">
                      <div className="h-full bg-orange-400" style={{ width: `${diskPct}%` }} />
                    </div>
                  </div>
                </div>

                {/* Power Controls */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={st === 'suspended' || Boolean(busy)}
                    onClick={() => power(st === 'running' ? 'stop' : 'start')}
                    title={st === 'running' ? 'Sunucuyu Durdur' : 'Sunucuyu Başlat'}
                    aria-label={st === 'running' ? 'Sunucuyu Durdur' : 'Sunucuyu Başlat'}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition shadow-lg disabled:opacity-40 ${
                      st === 'running'
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                    }`}
                  >
                    {busy ? (
                      <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : st === 'running' ? (
                      <PowerStopIcon className="w-5 h-5" />
                    ) : (
                      <PowerPlayIcon className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={st === 'suspended' || Boolean(busy)}
                      onClick={() => power('restart')}
                      title="Yeniden Başlat"
                      aria-label="Sunucuyu Yeniden Başlat"
                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-zinc-300 disabled:opacity-40"
                    >
                      <RestartIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={st !== 'running' || Boolean(busy)}
                      onClick={() => power('pause')}
                      title="Uyut / Duraklat"
                      aria-label="Sunucuyu Uyut veya Duraklat"
                      className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-white/[0.08] text-amber-400 disabled:opacity-40"
                    >
                      <PowerPauseIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section Content Area */}
          {section === 'overview' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel rounded-2xl p-5 space-y-2">
                  <div className="text-xs text-zinc-400">Bağlantı Adresi</div>
                  <div className="font-mono text-base font-bold text-amber-400 truncate">{domainAddr}</div>
                  <div className="text-xs text-zinc-400">
                    Port: {srv.port} • Süre:{' '}
                    {live.uptimeSec > 0
                      ? `${Math.floor(live.uptimeSec / 3600)}sa ${Math.floor((live.uptimeSec % 3600) / 60)}dk`
                      : st === 'running'
                      ? 'Az önce başladı'
                      : 'Çevrimdışı'}
                  </div>
                </div>
                <div className="glass-panel rounded-2xl p-5 space-y-2">
                  <div className="text-xs text-zinc-400">Aktif Kaynak Limiti</div>
                  <div className="font-display text-lg font-bold text-white">{srv.allocatedRamMb} MB RAM • %{srv.allocatedCpuPct} CPU</div>
                  <div className="text-xs text-zinc-400">NVMe Disk: {Math.round(srv.allocatedDiskMb / 1024)} GB</div>
                </div>
                <div className="glass-panel rounded-2xl p-5 space-y-2">
                  <div className="text-xs text-zinc-400">Hızlı Araçlar</div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <AnimatedButton size="xs" variant="secondary" onClick={() => setSection('ai')}>
                      AI Sağlık Skoru
                    </AnimatedButton>
                    <AnimatedButton size="xs" variant="secondary" onClick={() => setSection('network')}>
                      Domain Değiştir
                    </AnimatedButton>
                  </div>
                </div>
              </div>

              <div className="glass-panel rounded-2xl p-5">
                <TelemetryChart
                  data={history}
                  title="Anlık Sunucu Performans & Bellek Grafiği (Son 90sn)"
                  series={[
                    { key: 'cpuPct', label: 'CPU', color: '#f59e0b', unit: '%' },
                    { key: 'ramPct', label: 'RAM', color: '#34d399', unit: '%' },
                  ]}
                />
              </div>

              <div className="glass-panel rounded-2xl p-5">
                <h3 className="font-display text-base font-bold text-white mb-3">Canlı Konsol Akışı</h3>
                <LiveConsoleTab
                  serverId={srv.id}
                  lines={consoleLines}
                  status={st}
                  placeholder={srv.category === 'minecraft' ? 'Komut gönder (örn: say Merhaba, list, op isim)...' : 'Komut gönder...'}
                  quickCommands={
                    srv.category === 'minecraft'
                      ? [
                          { label: 'list', cmd: 'list' },
                          { label: 'save-all', cmd: 'save-all' },
                          { label: 'time day', cmd: 'time set day' },
                        ]
                      : []
                  }
                />
              </div>
            </div>
          )}

          {section === 'console' && (
            <div className="glass-panel rounded-2xl p-5">
              <LiveConsoleTab
                serverId={srv.id}
                lines={consoleLines}
                status={st}
                placeholder={srv.category === 'minecraft' ? 'Minecraft komutu (örn: op Emoç, list, say Merhaba)...' : 'Komut gönder...'}
                quickCommands={
                  srv.category === 'minecraft'
                    ? [
                        { label: 'list', cmd: 'list' },
                        { label: 'save-all', cmd: 'save-all' },
                        { label: 'Gündüz', cmd: 'time set day' },
                        { label: 'Hava Açık', cmd: 'weather clear' },
                      ]
                    : []
                }
              />
            </div>
          )}

          {srv.category === 'minecraft' &&
            ['minecraft', 'versions', 'players', 'plugins', 'mods', 'worlds', 'motd', 'settings'].includes(section) && (
              <MinecraftPanel
                server={srv}
                live={live}
                extra={data.extra}
                onReload={loadDetail}
                activeSection={section}
                onSelectSection={setSection}
              />
            )}

          {srv.category === 'web' && ['product_main', 'settings'].includes(section) && (
            <WebHostPanel
              server={srv}
              live={live}
              extra={data.extra}
              consoleLines={consoleLines}
              activeSection={section}
              onReload={loadDetail}
            />
          )}

          {srv.category === 'discord' && ['product_main', 'settings'].includes(section) && (
            <DiscordBotPanel
              server={srv}
              live={live}
              activeSection={section}
              onReload={loadDetail}
            />
          )}

          {srv.category === 'altyapi' && ['product_main', 'settings'].includes(section) && (
            <AltyapiPanel
              server={srv}
              live={live}
              activeSection={section}
              onReload={loadDetail}
            />
          )}

          {section === 'files' && (
            <div className="glass-panel rounded-2xl p-5">
              <FileManagerTab serverId={srv.id} defaultPath={srv.category === 'web' ? 'public_html' : ''} />
            </div>
          )}
          {section === 'sftp' && (
            <div className="glass-panel rounded-2xl p-5">
              <SftpTab serverId={srv.id} />
            </div>
          )}
          {section === 'backups' && (
            <div className="glass-panel rounded-2xl p-5">
              <BackupsTab serverId={srv.id} />
            </div>
          )}
          {section === 'logs' && <LatestLogTab serverId={srv.id} />}
          {section === 'tasks' && (
            <div className="glass-panel rounded-2xl p-5">
              <TasksTab server={srv} onReload={loadDetail} />
            </div>
          )}
          {section === 'network' && <NetworkPortsTab server={srv} onReload={loadDetail} />}
          {section === 'collaborators' && (
            <div className="glass-panel rounded-2xl p-5">
              <CollaboratorsTab serverId={srv.id} isServerOwner={data.isServerOwner} />
            </div>
          )}
          {section === 'activity' && <ActivityLogTab serverId={srv.id} />}
          {section === 'ai' && <AiAssistantTab serverId={srv.id} onReload={loadDetail} />}
          {section === 'upgrade' && <UpgradePlanTab server={srv} onReload={loadDetail} />}
        </div>
      </div>
    </div>
  );
}
