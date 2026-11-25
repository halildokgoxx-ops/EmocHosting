import React from 'react';
import { motion } from 'framer-motion';

/**
 * Geometric Sculpted Lion Crest Logo for EmoçHosting
 */
export function EmoLogo({ size = 38, showText = true, subtitle = false, className = '' }) {
  const uid = React.useId();
  const goldGrad = `emoc-lion-gold-${uid}`;
  const maneGrad = `emoc-lion-mane-${uid}`;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <motion.div
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 360, damping: 22 }}
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        <div
          className="absolute inset-0 rounded-xl opacity-35 blur-md"
          style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.55) 0%, transparent 72%)' }}
        />
        <svg
          width={size}
          height={size}
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10"
        >
          <defs>
            <linearGradient id={goldGrad} x1="12" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#fde68a" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ea580c" />
            </linearGradient>
            <linearGradient id={maneGrad} x1="8" y1="10" x2="56" y2="54" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#9a3412" />
            </linearGradient>
          </defs>

          {/* Rounded obsidian crest badge */}
          <rect x="3" y="3" width="58" height="58" rx="15" fill="#111216" stroke="rgba(245,158,11,0.38)" strokeWidth="1.8" />

          {/* Sculpted Geometric Lion Mane */}
          <path
            d="M32 10L40 16L49 14L48 24L53 31L48 41L41 51L32 55L23 51L16 41L11 31L16 24L15 14L24 16L32 10Z"
            fill="#191614"
            stroke={`url(#${maneGrad})`}
            strokeWidth="2.1"
            strokeLinejoin="round"
          />

          {/* Crown / Brow Ridges */}
          <path
            d="M21 22L27 25L32 21L37 25L43 22L41 30H23L21 22Z"
            fill={`url(#${goldGrad})`}
            opacity="0.95"
          />

          {/* Fierce Eyes */}
          <path d="M22 31L28 33.5L24.5 36.5L22 31Z" fill="#09090b" />
          <path d="M42 31L36 33.5L39.5 36.5L42 31Z" fill="#09090b" />
          <circle cx="25.2" cy="33.5" r="1.1" fill="#fde68a" />
          <circle cx="38.8" cy="33.5" r="1.1" fill="#fde68a" />

          {/* Cheek Facets */}
          <path
            d="M20 33L24 43L32 48L40 43L44 33"
            stroke={`url(#${goldGrad})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Nose & Chin Bridge */}
          <path d="M29 36H35L32 41L29 36Z" fill={`url(#${goldGrad})`} />
          <path d="M32 41V46M28 44L32 47L36 44" stroke="#fbbf24" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </motion.div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-baseline font-display text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap">
            <span className="text-white">Emoç</span>
            <span className="text-amber-400">Hosting</span>
          </div>
          {subtitle && (
            <span className="mt-0.5 text-[10px] font-medium tracking-wider text-zinc-400 whitespace-nowrap">
              Bulut &amp; Oyun Altyapısı
            </span>
          )}
        </div>
      )}
    </div>
  );
}
