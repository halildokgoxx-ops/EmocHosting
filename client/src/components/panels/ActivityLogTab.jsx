import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';

export function ActivityLogTab({ serverId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiRequest(`/api/servers/${serverId}/activity`)
      .then((d) => setLogs(d.logs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serverId]);

  return (
    <div className="glass-panel rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="font-display text-lg font-bold text-white">Etkinlik Kaydı</h3>
        <p className="text-xs text-zinc-400">Sunucu üzerinde gerçekleştirilen tüm başlatma, durdurma, kurulum ve ayar değişiklikleri.</p>
      </div>

      {loading ? (
        <div className="py-10 text-center text-xs text-zinc-400">Kayıtlar yükleniyor...</div>
      ) : logs.length === 0 ? (
        <div className="py-10 text-center text-xs text-zinc-500">Henüz kayıtlı bir sunucu etkinliği yok.</div>
      ) : (
        <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {logs.map((log) => (
            <div key={log.id} className="p-3 rounded-xl bg-[#09090b] border border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-mono font-bold text-amber-400 mr-2">{log.action}</span>
                <span className="text-zinc-400">{log.actorEmail}</span>
                {log.details && Object.keys(log.details).length > 0 && (
                  <div className="text-[11px] font-mono text-zinc-500 mt-0.5">{JSON.stringify(log.details)}</div>
                )}
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">
                {log.createdAt ? new Date(log.createdAt).toLocaleString('tr-TR') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
