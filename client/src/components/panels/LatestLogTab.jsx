import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../lib/api';
import { AnimatedButton } from '../ui/AnimatedButton';

export function LatestLogTab({ serverId }) {
  const [lines, setLines] = useState([]);
  const [file, setFile] = useState('latest.log');

  const load = useCallback(() => {
    apiRequest(`/api/servers/${serverId}/logs/latest`)
      .then((d) => {
        setLines(d.lines || []);
        if (d.file) setFile(d.file);
      })
      .catch(() => {});
  }, [serverId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-bold text-white">Sistem Günlüğü (`logs/{file}`)</h3>
          <p className="text-xs text-zinc-400">Disk üzerindeki son 500 log satırı.</p>
        </div>
        <AnimatedButton size="xs" variant="secondary" onClick={load}>
          Yenile
        </AnimatedButton>
      </div>

      <div className="rounded-xl bg-[#070709] border border-white/[0.08] p-4 h-[440px] overflow-y-auto font-mono text-[11px] space-y-1">
        {lines.length === 0 ? (
          <span className="text-zinc-500">Log dosyası henüz oluşmamış.</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} className={l.includes('ERROR') ? 'text-rose-400' : l.includes('WARN') ? 'text-amber-300' : 'text-zinc-300'}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
