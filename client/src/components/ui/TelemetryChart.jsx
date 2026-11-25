import React, { useState, useId } from 'react';

/**
 * Lightweight zero-dependency dual-series SVG area/line chart for real-time telemetry.
 */
export function TelemetryChart({
  data = [],
  series = [
    { key: 'cpuPct', label: 'CPU %', color: '#f59e0b', unit: '%' },
    { key: 'ramPct', label: 'RAM %', color: '#34d399', unit: '%' },
  ],
  maxY = 100,
  height = 170,
  title = 'Canlı Kaynak Kullanım Grafiği',
  emptyText = 'Canlı telemetri verileri birkaç saniye içinde grafikte görüntülenecek...',
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const uid = useId().replace(/:/g, '');

  const points = Array.isArray(data) ? data : [];
  const W = 640;
  const H = 160;
  const padX = 8;
  const padY = 12;
  const plotW = W - padX * 2;
  const plotH = H - padY * 2;

  const activeIdx = hoverIdx !== null && hoverIdx < points.length ? hoverIdx : points.length - 1;
  const activePoint = points[activeIdx] || null;

  function buildPaths(key) {
    if (points.length === 0) return { line: '', area: '', coords: [] };
    const safeMax = Math.max(10, Number(maxY || 100));
    const coords = points.map((pt, i) => {
      const x = points.length === 1 ? padX + plotW / 2 : padX + (i / (points.length - 1)) * plotW;
      const val = Math.max(0, Math.min(safeMax, Number(pt[key] || 0)));
      const y = padY + plotH - (val / safeMax) * plotH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val };
    });

    const line = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
    const area =
      coords.length > 1
        ? `${line} L${coords[coords.length - 1].x},${padY + plotH} L${coords[0].x},${padY + plotH} Z`
        : '';
    return { line, area, coords };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold text-zinc-300">{title}</div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono tabular-nums">
          {series.map((s) => {
            const val = activePoint ? Number(activePoint[s.key] || 0).toFixed(1) : '0.0';
            return (
              <span key={s.key} className="inline-flex items-center gap-1.5 text-zinc-300">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span>{s.label}:</span>
                <strong className="text-white">
                  {val}
                  {s.unit || ''}
                </strong>
              </span>
            );
          })}
          {activePoint?.time && (
            <span className="text-zinc-500">({activePoint.time})</span>
          )}
        </div>
      </div>

      {points.length < 2 ? (
        <div
          className="rounded-xl bg-[#09090b] border border-white/[0.06] flex items-center justify-center text-xs text-zinc-400 px-4 text-center"
          style={{ height }}
        >
          {emptyText}
        </div>
      ) : (
        <div
          className="relative rounded-xl bg-[#09090b] border border-white/[0.06] p-2 overflow-hidden"
          onMouseLeave={() => setHoverIdx(null)}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full block select-none"
            style={{ height }}
            role="img"
            aria-label={title}
            preserveAspectRatio="none"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              setHoverIdx(Math.round(ratio * (points.length - 1)));
            }}
          >
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`grad-${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.color} stopOpacity="0.32" />
                  <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
                </linearGradient>
              ))}
            </defs>

            {[25, 50, 75, 100].map((pct) => {
              const y = padY + plotH - (pct / 100) * plotH;
              return (
                <g key={pct}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={W - padX}
                    y2={y}
                    stroke="rgba(255,255,255,0.06)"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                </g>
              );
            })}

            {series.map((s) => {
              const { line, area, coords } = buildPaths(s.key);
              const dot = coords[activeIdx];
              return (
                <g key={s.key}>
                  {area && <path d={area} fill={`url(#grad-${uid}-${s.key})`} />}
                  {line && (
                    <path
                      d={line}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {dot && (
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r="4"
                      fill={s.color}
                      stroke="#09090b"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              );
            })}

            {activePoint && points.length > 1 && (
              <line
                x1={padX + (activeIdx / (points.length - 1)) * plotW}
                y1={padY}
                x2={padX + (activeIdx / (points.length - 1)) * plotW}
                y2={padY + plotH}
                stroke="rgba(255,255,255,0.16)"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
