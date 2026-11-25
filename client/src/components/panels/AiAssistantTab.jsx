import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { AnimatedButton } from '../ui/AnimatedButton';

export function AiAssistantTab({ serverId, onReload }) {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fixing, setFixing] = useState('');

  async function runScan() {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/ai-diagnose`, { method: 'POST' });
      setReport(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runScan();
  }, [serverId]);

  async function applyFix(fixAction) {
    setFixing(fixAction);
    try {
      const res = await apiRequest(`/api/servers/${serverId}/ai-fix`, {
        method: 'POST',
        body: { fixAction },
      });
      toast.success(res.message);
      await runScan();
      onReload?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFixing('');
    }
  }

  const badgeStyle = {
    critical: 'bg-rose-500/15 border-rose-500/35 text-rose-300',
    warning: 'bg-amber-500/15 border-amber-500/35 text-amber-300',
    tip: 'bg-sky-500/15 border-sky-500/35 text-sky-300',
    ok: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300',
  };

  const score = Number(report?.healthScore ?? 100);
  const scoreColor =
    score >= 90 ? 'text-emerald-400' : score >= 70 ? 'text-amber-300' : score >= 45 ? 'text-orange-400' : 'text-rose-400';
  const barColor =
    score >= 90 ? 'bg-emerald-400' : score >= 70 ? 'bg-amber-400' : score >= 45 ? 'bg-orange-400' : 'bg-rose-500';

  return (
    <div className="space-y-5">
      <div className="glass-panel rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="font-display text-lg font-bold text-white">AI Sunucu Teşhis &amp; Sağlık Asistanı</h3>
          <p className="text-xs text-zinc-400">
            Logları, yapılandırmayı (`.properties`, `eula.txt`, `.env`, `site.config.json`) ve kaynak sınırlarını gerçek zamanlı analiz eder.
          </p>
        </div>
        <AnimatedButton size="sm" loading={loading} onClick={runScan}>
          Yeniden Analiz Et
        </AnimatedButton>
      </div>

      {report && (
        <>
          <div className="glass-panel-luminous rounded-2xl p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Sağlık Skoru</div>
              <div className="flex items-baseline gap-2.5 mt-1 tabular-nums">
                <span className={`font-display text-4xl font-black ${scoreColor}`}>{score}</span>
                <span className="text-xs text-zinc-400">/ 100 • {report.grade || 'Mükemmel'}</span>
              </div>
            </div>
            <div className="sm:col-span-2 space-y-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Yapılandırma &amp; Kararlılık Analizi</span>
                <span className="font-mono text-zinc-300">Disk: {report.diskUsedMb ?? 0} MB</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div className={`h-full transition-all duration-500 ${barColor}`} style={{ width: `${score}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {(report.issues || []).map((issue) => (
              <div
                key={issue.id}
                className="glass-panel rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase ${badgeStyle[issue.severity] || badgeStyle.tip}`}>
                      {issue.severity}
                    </span>
                    <h4 className="font-bold text-sm text-white">{issue.title}</h4>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{issue.detail}</p>
                </div>
                {issue.fixAction && (
                  <AnimatedButton
                    size="xs"
                    variant="primary"
                    loading={fixing === issue.fixAction}
                    onClick={() => applyFix(issue.fixAction)}
                  >
                    {issue.fixLabel || 'Otomatik Düzelt'}
                  </AnimatedButton>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
