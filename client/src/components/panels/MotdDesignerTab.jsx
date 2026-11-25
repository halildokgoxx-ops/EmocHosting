import React, { useState, useEffect } from 'react';
import { apiRequest, fetchAuthenticatedBlob } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';
import { PaletteMotdIcon, UploadIcon } from '../icons/EmoIcons';

const MC_COLORS = [
  { code: '§0', hex: '#000000', name: 'Siyah' },
  { code: '§1', hex: '#0000AA', name: 'Koyu Mavi' },
  { code: '§2', hex: '#00AA00', name: 'Koyu Yeşil' },
  { code: '§3', hex: '#00AAAA', name: 'Turkuaz' },
  { code: '§4', hex: '#AA0000', name: 'Koyu Kırmızı' },
  { code: '§5', hex: '#AA00AA', name: 'Mor' },
  { code: '§6', hex: '#FFAA00', name: 'Altın' },
  { code: '§7', hex: '#AAAAAA', name: 'Gri' },
  { code: '§8', hex: '#555555', name: 'Koyu Gri' },
  { code: '§9', hex: '#5555FF', name: 'Mavi' },
  { code: '§a', hex: '#55FF55', name: 'Açık Yeşil' },
  { code: '§b', hex: '#55FFFF', name: 'Aqua' },
  { code: '§c', hex: '#FF5555', name: 'Kırmızı' },
  { code: '§d', hex: '#FF55FF', name: 'Pembe' },
  { code: '§e', hex: '#FFFF55', name: 'Sarı' },
  { code: '§f', hex: '#FFFFFF', name: 'Beyaz' },
];

const COLOR_MAP = Object.fromEntries(MC_COLORS.map((c) => [c.code[1], c.hex]));

function parseMinecraftColoredLine(line = '') {
  const segments = [];
  let color = '#AAAAAA';
  let bold = false;
  let italic = false;
  let underline = false;
  let strike = false;
  let buf = '';

  const flush = () => {
    if (buf) segments.push({ text: buf, color, bold, italic, underline, strike });
    buf = '';
  };

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if ((ch === '§' || ch === '&') && i + 1 < line.length) {
      const code = line[i + 1].toLowerCase();
      if (COLOR_MAP[code]) {
        flush();
        color = COLOR_MAP[code];
        bold = false;
        italic = false;
        underline = false;
        strike = false;
        i++;
        continue;
      }
      if (code === 'l') { flush(); bold = true; i++; continue; }
      if (code === 'o') { flush(); italic = true; i++; continue; }
      if (code === 'n') { flush(); underline = true; i++; continue; }
      if (code === 'm') { flush(); strike = true; i++; continue; }
      if (code === 'r') { flush(); color = '#AAAAAA'; bold = false; italic = false; underline = false; strike = false; i++; continue; }
    }
    buf += ch;
  }
  flush();
  return segments;
}

export function MotdDesignerTab({ server, initialMotd = '', hasIcon = false, onSaved }) {
  const toast = useToast();
  const decoded = String(initialMotd || `§b§lemoçhosting §8| §f${server.name}\\n§aYeni Nesil 1.21+ Hayatta Kalma Sunucusu`).split('\\n');
  const [line1, setLine1] = useState(decoded[0] || '');
  const [line2, setLine2] = useState(decoded[1] || '');
  const [activeLine, setActiveLine] = useState(1);
  const [iconUrl, setIconUrl] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = null;
    if (hasIcon) {
      fetchAuthenticatedBlob(`/api/servers/${server.id}/mc/icon`)
        .then((blob) => {
          if (!active) return;
          createdUrl = URL.createObjectURL(blob);
          setIconUrl(createdUrl);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [hasIcon, server.id]);

  function insertCode(code) {
    if (activeLine === 1) setLine1((v) => v + code);
    else setLine2((v) => v + code);
  }

  async function saveMotd() {
    setSaving(true);
    try {
      const combined = line2 ? `${line1}\\n${line2}` : line1;
      await apiRequest(`/api/servers/${server.id}/mc/motd`, { method: 'POST', body: { motd: combined } });
      toast.success('MOTD server.properties dosyasına kaydedildi!');
      onSaved?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function uploadIcon(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('icon', file);
    try {
      await apiRequest(`/api/servers/${server.id}/mc/icon`, { method: 'POST', body: fd, isFormData: true });
      const blob = await fetchAuthenticatedBlob(`/api/servers/${server.id}/mc/icon?v=${Date.now()}`);
      const objUrl = URL.createObjectURL(blob);
      setIconUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return objUrl;
      });
      toast.success('server-icon.png yüklendi! (Önerilen boyut: 64x64 PNG)');
    } catch (err) {
      toast.error(err.message);
    }
  }

  const presets = [
    { name: 'Cyber SMP', l1: '§b§lemoçhosting §8» §fUltra Akıcı §eSMP', l2: '§a✔ 1.21.4 Destekli §8| §dÖzel Etkinlikler Aktif!' },
    { name: 'SkyBlock', l1: '§6§lALTIN SKYBLOCK §8• §fSezon #1', l2: '§bMinionlar, Çiftçiler &amp; §aGünlük Ödüller!' },
    { name: 'Bakım Modu', l1: '§c§lBAKIM MODU §8| §femoçhosting', l2: '§7Sunucumuz güncelleniyor, çok yakında açılıyoruz.' },
  ];

  const renderSegs = (txt) =>
    parseMinecraftColoredLine(txt).map((s, idx) => (
      <span
        key={idx}
        style={{
          color: s.color,
          fontWeight: s.bold ? 700 : 400,
          fontStyle: s.italic ? 'italic' : 'normal',
          textDecoration: `${s.underline ? 'underline ' : ''}${s.strike ? 'line-through' : ''}`,
        }}
      >
        {s.text}
      </span>
    ));

  return (
    <div className="space-y-6">
      {/* Live Minecraft Server List Card Preview */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#181411] border-2 border-[#3a322c] shadow-2xl">
        <div className="text-[11px] font-mono text-amber-300/80 mb-2 flex items-center justify-between">
          <span>Canlı Minecraft Sunucu Listesi Önizlemesi</span>
          <span>64x64 Icon + 2 Satır MOTD</span>
        </div>
        <div className="flex items-start gap-3.5 bg-[#0e0c0a] p-3.5 rounded-xl border border-white/10">
          <div className="w-16 h-16 rounded-lg bg-slate-900 border border-white/15 shrink-0 overflow-hidden flex items-center justify-center">
            {iconUrl ? (
              <img src={iconUrl} alt="Minecraft sunucu ikonu" width={64} height={64} className="w-full h-full object-cover" />
            ) : (
              <PaletteMotdIcon className="w-8 h-8 opacity-60" />
            )}
          </div>
          <div className="flex-1 min-w-0 font-mono text-xs sm:text-sm leading-5">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-bold text-white truncate">{server.name}</span>
              <span className="text-slate-400 text-xs shrink-0">0/{server.slotsOrPorts || 20} • 12ms ▂▄▆█</span>
            </div>
            <div className="truncate">{renderSegs(line1)}</div>
            <div className="truncate">{renderSegs(line2)}</div>
          </div>
        </div>
      </div>

      {/* Color & Format Palette */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-white">Renk &amp; Biçim Araç Çubuğu (Satır {activeLine} için tıkla)</span>
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/35 text-emerald-200 text-xs font-semibold">
            <UploadIcon className="w-3.5 h-3.5" />
            <span>server-icon.png Yükle</span>
            <input type="file" accept="image/png" className="hidden" onChange={uploadIcon} />
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MC_COLORS.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => insertCode(c.code)}
              title={`${c.name} (${c.code})`}
              aria-label={`${c.name} renk kodu (${c.code}) ekle`}
              className="w-7 h-7 rounded-lg border border-white/25 hover:scale-110 transition shadow"
              style={{ backgroundColor: c.hex }}
            />
          ))}
          {[
            { code: '§l', label: 'Kalın' },
            { code: '§o', label: 'İtalik' },
            { code: '§n', label: 'Altı Çizili' },
            { code: '§m', label: 'Üstü Çizili' },
            { code: '§r', label: 'Sıfırla' },
          ].map((f) => (
            <button
              key={f.code}
              type="button"
              onClick={() => insertCode(f.code)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white"
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">1. Satır</label>
          <input
            value={line1}
            onFocus={() => setActiveLine(1)}
            onChange={(e) => setLine1(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 outline-none font-mono text-xs text-white"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">2. Satır</label>
          <input
            value={line2}
            onFocus={() => setActiveLine(2)}
            onChange={(e) => setLine2(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 focus:border-cyan-400 outline-none font-mono text-xs text-white"
          />
        </div>
      </div>

      {/* Presets & Save */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => {
                setLine1(p.l1);
                setLine2(p.l2);
              }}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-violet-500/20 border border-white/10 text-xs text-violet-200"
            >
              Şablon: {p.name}
            </button>
          ))}
        </div>
        <AnimatedButton variant="emerald" loading={saving} onClick={saveMotd}>
          MOTD Kaydet
        </AnimatedButton>
      </div>
    </div>
  );
}
