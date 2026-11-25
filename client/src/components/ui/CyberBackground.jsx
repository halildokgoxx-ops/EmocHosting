import React from 'react';

export function CyberBackground() {
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#09090b]">
      {/* Architectural obsidian dot grid with radial fade — zero matrix lines */}
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
          maskImage: 'radial-gradient(ellipse 75% 60% at 50% 10%, #000 10%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 60% at 50% 10%, #000 10%, transparent 100%)',
        }}
      />
      {/* Warm amber top studio rim spotlight */}
      <div
        className="absolute -top-60 left-1/2 -translate-x-1/2 w-[980px] h-[460px] rounded-full blur-[165px] opacity-[0.13]"
        style={{ background: 'radial-gradient(circle, #f59e0b 0%, rgba(234,88,12,0.42) 45%, transparent 75%)' }}
      />
      <div
        className="absolute -bottom-32 -right-24 w-[640px] h-[420px] rounded-full blur-[170px] opacity-[0.07]"
        style={{ background: 'radial-gradient(circle, #fb923c 0%, transparent 70%)' }}
      />
    </div>
  );
}
