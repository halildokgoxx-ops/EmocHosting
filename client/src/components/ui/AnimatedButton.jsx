import React from 'react';
import { motion } from 'framer-motion';

const VARIANTS = {
  primary: 'btn-cyber-glow text-zinc-950 font-bold shadow-lg',
  secondary:
    'bg-zinc-900/90 hover:bg-zinc-800 text-zinc-100 border border-white/10 hover:border-amber-400/40',
  emerald:
    'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold shadow-sm',
  warning:
    'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-sm',
  danger:
    'bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-sm',
  ghost: 'bg-transparent hover:bg-white/5 text-zinc-300 hover:text-white border border-transparent hover:border-white/10',
};

const SIZES = {
  xs: 'px-2.5 py-1.5 text-xs rounded-lg gap-1.5',
  sm: 'px-3.5 py-2 text-xs rounded-xl gap-2',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-sm sm:text-base rounded-xl gap-2.5',
};

export function AnimatedButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  onClick,
  type = 'button',
  ...props
}) {
  return (
    <motion.button
      type={type}
      whileHover={disabled || loading ? {} : { scale: 1.015 }}
      whileTap={disabled || loading ? {} : { scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
      disabled={disabled || loading}
      onClick={onClick}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 whitespace-nowrap disabled:opacity-45 disabled:cursor-not-allowed ${
        VARIANTS[variant] || VARIANTS.primary
      } ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </motion.button>
  );
}
