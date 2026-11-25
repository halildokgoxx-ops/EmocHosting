import React, { useState, useRef, useEffect, useMemo } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';

export function LiveConsoleTab({ serverId, lines, status, placeholder = 'Komut gönder...', quickCommands = [] }) {
  const [cmd, setCmd] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const toast = useToast();

  // Deduplicate console entries by ID to prevent React StrictMode / socket race duplicates
  const uniqueLines = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const l of lines || []) {
      const key = l?.id ?? `${l?.time}-${l?.stream}-${l?.text}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(l);
      }
    }
    return out;
  }, [lines]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [uniqueLines.length]);

  async function sendCmd(c) {
    if (sending) return;
    const text = (c ?? cmd).trim();
    if (!text) return;
    setSending(true);
    try {
      await apiRequest(`/api/servers/${serverId}/command`, { method: 'POST', body: { command: text } });
      if (c === undefined) setCmd('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function clearLogs() {
    try {
      await apiRequest(`/api/servers/${serverId}/console/clear`, { method: 'POST' });
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {quickCommands.map((q) => (
            <button
              key={q.cmd}
              type="button"
              onClick={() => sendCmd(q.cmd)}
              disabled={status !== 'running' || sending}
              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-amber-500/15 border border-white/[0.08] text-[11px] font-mono text-amber-300 disabled:opacity-40 transition"
            >
              {q.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={clearLogs} className="text-xs text-zinc-400 hover:text-white transition">
          Konsolu Temizle
        </button>
      </div>

      <div className="rounded-xl bg-[#070709] border border-white/[0.08] p-4 h-[420px] overflow-y-auto font-mono text-xs space-y-1">
        {uniqueLines.length === 0 ? (
          <div className="text-zinc-500">Konsol çıktısı bekleniyor. Sunucuyu başlattığınızda canlı akış burada görünür.</div>
        ) : (
          uniqueLines.map((l) => (
            <div
              key={l.id}
              className={`leading-relaxed break-all ${
                l.stream === 'stderr'
                  ? 'text-rose-400'
                  : l.stream === 'system'
                  ? 'text-amber-300'
                  : l.stream === 'input'
                  ? 'text-emerald-300 font-semibold'
                  : 'text-zinc-200'
              }`}
            >
              <span className="text-zinc-600 mr-2">[{l.time}]</span>
              {l.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendCmd();
        }}
        className="flex gap-2"
      >
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          disabled={status !== 'running' || sending}
          placeholder={status === 'running' ? placeholder : 'Komut göndermek için sunucuyu başlatın'}
          className="flex-1 px-4 py-2.5 rounded-xl bg-[#09090b] border border-white/10 focus:border-amber-500 outline-none font-mono text-xs text-white disabled:opacity-50"
        />
        <AnimatedButton type="submit" loading={sending} disabled={status !== 'running' || !cmd.trim()}>
          Gönder
        </AnimatedButton>
      </form>
    </div>
  );
}
