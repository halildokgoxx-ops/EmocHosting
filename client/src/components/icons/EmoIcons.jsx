import React from 'react';

const base = (className = 'w-5 h-5') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
});

export function MinecraftIcon({ className = 'w-6 h-6' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 2.5L20.5 7.2V16.8L12 21.5L3.5 16.8V7.2L12 2.5Z" fill="rgba(16,185,129,0.16)" stroke="#10b981" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M3.5 7.2L12 12L20.5 7.2" stroke="#34d399" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 12V21.5" stroke="#34d399" strokeWidth="1.7" />
      <path d="M7.5 9.6L16.5 4.8" stroke="#6ee7b7" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function WebsiteIcon({ className = 'w-6 h-6' }) {
  return (
    <svg {...base(className)}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" fill="rgba(0,240,255,0.12)" stroke="#00f0ff" strokeWidth="1.7" />
      <path d="M2.5 9H21.5" stroke="#00f0ff" strokeWidth="1.6" />
      <circle cx="5.8" cy="6.5" r="0.9" fill="#22d3ee" />
      <circle cx="8.5" cy="6.5" r="0.9" fill="#a78bfa" />
      <path d="M9.5 12.5L7.5 14.5L9.5 16.5M14.5 12.5L16.5 14.5L14.5 16.5M12.7 12L11.3 17" stroke="#67e8f9" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DiscordBotIcon({ className = 'w-6 h-6' }) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="6" width="16" height="13" rx="4.5" fill="rgba(124,58,237,0.18)" stroke="#a78bfa" strokeWidth="1.7" />
      <path d="M12 3V6M8.5 3.5H15.5" stroke="#00f0ff" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.2" cy="12" r="1.5" fill="#00f0ff" />
      <circle cx="14.8" cy="12" r="1.5" fill="#00f0ff" />
      <path d="M9 15.8C10 16.5 14 16.5 15 15.8" stroke="#c4b5fd" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function AltyapiIcon({ className = 'w-6 h-6' }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="3.5" width="18" height="5" rx="1.6" fill="rgba(59,130,246,0.16)" stroke="#38bdf8" strokeWidth="1.6" />
      <rect x="3" y="9.8" width="18" height="5" rx="1.6" fill="rgba(124,58,237,0.16)" stroke="#818cf8" strokeWidth="1.6" />
      <rect x="3" y="16" width="18" height="4.5" rx="1.6" fill="rgba(0,240,255,0.12)" stroke="#22d3ee" strokeWidth="1.6" />
      <circle cx="6.5" cy="6" r="0.9" fill="#00f0ff" />
      <circle cx="6.5" cy="12.3" r="0.9" fill="#a78bfa" />
      <circle cx="6.5" cy="18.2" r="0.9" fill="#10b981" />
      <path d="M14 6H18M14 12.3H18M14 18.2H18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

export function PowerPlayIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M6.5 4.8L18.5 12L6.5 19.2V4.8Z" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function PowerStopIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <rect x="5.5" y="5.5" width="13" height="13" rx="2.5" fill="currentColor" />
    </svg>
  );
}

export function PowerPauseIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <rect x="6" y="5" width="4.2" height="14" rx="1.4" fill="currentColor" />
      <rect x="13.8" y="5" width="4.2" height="14" rx="1.4" fill="currentColor" />
    </svg>
  );
}

export function RestartIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M20 12A8 8 0 1 1 17.6 6.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M20 3.8V8H15.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ConsoleTerminalIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="2.5" y="4" width="19" height="16" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 9.5L10.5 12.2L7 15" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 15H17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function CpuChipIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="6" y="6" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.7" fill="rgba(0,240,255,0.08)" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="#00f0ff" />
      <path d="M9 2.5V6M15 2.5V6M9 18V21.5M15 18V21.5M2.5 9H6M2.5 15H6M18 9H21.5M18 15H21.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function RamStickIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="2.5" y="6.5" width="19" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" fill="rgba(124,58,237,0.1)" />
      <path d="M6.5 10V13M10 10V13M13.5 10V13M17 10V13M6 16.5V19M10 16.5V19M14 16.5V19M18 16.5V19" stroke="#a78bfa" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function DiskDriveIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <ellipse cx="12" cy="6.5" rx="8" ry="3.2" stroke="currentColor" strokeWidth="1.7" fill="rgba(16,185,129,0.1)" />
      <path d="M4 6.5V17.5C4 19.3 7.6 20.7 12 20.7C16.4 20.7 20 19.3 20 17.5V6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4 12C4 13.8 7.6 15.2 12 15.2C16.4 15.2 20 13.8 20 12" stroke="currentColor" strokeWidth="1.5" opacity="0.7" />
    </svg>
  );
}

export function FolderIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M3 6.5C3 5.4 3.9 4.5 5 4.5H9.5L11.5 6.8H19C20.1 6.8 21 7.7 21 8.8V17.5C21 18.6 20.1 19.5 19 19.5H5C3.9 19.5 3 18.6 3 17.5V6.5Z" fill="rgba(0,240,255,0.14)" stroke="#22d3ee" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function FileCodeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M6 3.5H14.5L18.5 7.5V19.5C18.5 20.1 18 20.5 17.5 20.5H6C5.4 20.5 5 20.1 5 19.5V4.5C5 3.9 5.4 3.5 6 3.5Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(255,255,255,0.03)" />
      <path d="M14 3.5V8H18.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 12L7.8 13.8L9.5 15.6M14.5 12L16.2 13.8L14.5 15.6" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BackupZipIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M6 3.5H18C19.1 3.5 20 4.4 20 5.5V18.5C20 19.6 19.1 20.5 18 20.5H6C4.9 20.5 4 19.6 4 18.5V5.5C4 4.4 4.9 3.5 6 3.5Z" stroke="currentColor" strokeWidth="1.6" fill="rgba(59,130,246,0.1)" />
      <path d="M12 6V14M12 14L9 11M12 14L15 11M8 17.5H16" stroke="#38bdf8" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShieldAdminIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 2.5L19.5 5.8V11.8C19.5 16.5 16.3 19.9 12 21.5C7.7 19.9 4.5 16.5 4.5 11.8V5.8L12 2.5Z" fill="rgba(244,63,94,0.14)" stroke="#fb7185" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.5 12.2L11.3 14L15 10" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrophyIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M7 4H17V10C17 12.8 14.8 15 12 15C9.2 15 7 12.8 7 10V4Z" fill="rgba(250,204,21,0.15)" stroke="#facc15" strokeWidth="1.7" />
      <path d="M7 6H4.5C4.5 9 5.5 10.5 7 10.8M17 6H19.5C19.5 9 18.5 10.5 17 10.8M12 15V19M8.5 19.5H15.5" stroke="#facc15" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CouponTagIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M4 7.5C4 6.4 4.9 5.5 6 5.5H18C19.1 5.5 20 6.4 20 7.5V10C18.9 10 18 10.9 18 12C18 13.1 18.9 14 20 14V16.5C20 17.6 19.1 18.5 18 18.5H6C4.9 18.5 4 17.6 4 16.5V14C5.1 14 6 13.1 6 12C6 10.9 5.1 10 4 10V7.5Z" fill="rgba(0,240,255,0.1)" stroke="#22d3ee" strokeWidth="1.6" />
      <path d="M9.5 14.5L14.5 9.5" stroke="#a78bfa" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.8" cy="9.8" r="1" fill="#00f0ff" />
      <circle cx="14.2" cy="14.2" r="1" fill="#a78bfa" />
    </svg>
  );
}

export function GiftInviteIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" stroke="#a78bfa" strokeWidth="1.6" fill="rgba(124,58,237,0.12)" />
      <path d="M2.5 6.5H21.5V9H2.5V6.5Z" stroke="#00f0ff" strokeWidth="1.6" rx="1" />
      <path d="M12 6.5V20.5M12 6.5C10.5 3.5 7 3.5 7.5 6.5M12 6.5C13.5 3.5 17 3.5 16.5 6.5" stroke="#00f0ff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TicketSupportIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M4 12C4 7.6 7.6 4 12 4C16.4 4 20 7.6 20 12V16.5C20 17.6 19.1 18.5 18 18.5H15.5V13.5H19.5M4.5 13.5H8.5V18.5H6C4.9 18.5 4 17.6 4 16.5V12Z" stroke="#38bdf8" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 20.5H15.5" stroke="#a78bfa" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function WalletCoinIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="5.5" width="18" height="13" rx="3" stroke="#10b981" strokeWidth="1.7" fill="rgba(16,185,129,0.12)" />
      <path d="M15 10.5H21V14H15C14.2 14 13.5 13.3 13.5 12.5V12C13.5 11.2 14.2 10.5 15 10.5Z" stroke="#34d399" strokeWidth="1.6" />
      <circle cx="16.5" cy="12.2" r="0.9" fill="#00f0ff" />
    </svg>
  );
}

export function KeyVaultIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="8" cy="14" r="4" stroke="#f59e0b" strokeWidth="1.7" fill="rgba(245,158,11,0.12)" />
      <path d="M11 11.2L19.5 4.5M16.5 6.8L18.5 9M14 8.8L16 11" stroke="#fbbf24" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SettingsGearIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 2.8V5M12 19V21.2M4.8 4.8L6.4 6.4M17.6 17.6L19.2 19.2M2.8 12H5M19 12H21.2M4.8 19.2L6.4 17.6M17.6 6.4L19.2 4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ClockScheduleIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12.5L15.5 14.5" stroke="#00f0ff" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function PluginSparkIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 2.5L14.3 8.2L20 10.5L14.3 12.8L12 18.5L9.7 12.8L4 10.5L9.7 8.2L12 2.5Z" fill="rgba(0,240,255,0.18)" stroke="#00f0ff" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="18.5" cy="17.5" r="1.5" fill="#a78bfa" />
    </svg>
  );
}

export function PlayersGroupIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="9.5" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3.5 19.5C3.5 16.5 6.2 14.5 9.5 14.5C12.8 14.5 15.5 16.5 15.5 19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.5" cy="9.5" r="2.3" stroke="#22d3ee" strokeWidth="1.5" />
      <path d="M16.5 14.5C18.8 14.8 20.5 16.6 20.5 19.5" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function DiscordBrandIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M18.9 5.5C17.5 4.9 16 4.4 14.5 4.2L14 5.3C12.7 5.1 11.3 5.1 10 5.3L9.5 4.2C8 4.4 6.5 4.9 5.1 5.5C2.8 9 2.2 12.4 2.5 15.7C4.2 17 5.9 17.8 7.6 18.3L8.5 17C7.8 16.7 7.1 16.3 6.5 15.9L7.1 15.4C10.3 16.9 13.7 16.9 16.9 15.4L17.5 15.9C16.9 16.3 16.2 16.7 15.5 17L16.4 18.3C18.1 17.8 19.8 17 21.5 15.7C21.8 11.9 20.9 8.5 18.9 5.5Z" fill="rgba(99,102,241,0.22)" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="9.2" cy="11.8" r="1.3" fill="#e0e7ff" />
      <circle cx="14.8" cy="11.8" r="1.3" fill="#e0e7ff" />
    </svg>
  );
}

export function WrenchMaintenanceIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4.2 16.8a1.8 1.8 0 0 0 2.6 2.6l5.1-5.1a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.6-.7-.7-2.6 3-1.6z" stroke="#f59e0b" strokeWidth="1.6" strokeLinejoin="round" fill="rgba(245,158,11,0.12)" />
    </svg>
  );
}

export function BanHammerIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" stroke="#ef4444" strokeWidth="1.7" fill="rgba(239,68,68,0.1)" />
      <path d="M6.2 6.2L17.8 17.8" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function MegaphoneIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M4 11V13C4 14.1 4.9 15 6 15H8L16 19V5L8 9H6C4.9 9 4 9.9 4 11Z" stroke="#22d3ee" strokeWidth="1.7" strokeLinejoin="round" fill="rgba(0,240,255,0.1)" />
      <path d="M19 9.5C20 10.5 20 13.5 19 14.5" stroke="#a78bfa" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function ChartPulseIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M3 13H7L9.5 6.5L13.5 17.5L16.5 11H21" stroke="#00f0ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BellIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M6 10A6 6 0 0 1 18 10V14.5L20 17H4L6 14.5V10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 19.5A2 2 0 0 0 14 19.5" stroke="#00f0ff" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function UploadIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 16V4M12 4L7.5 8.5M12 4L16.5 8.5M4 17.5V19.5H20V17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DownloadIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 4V16M12 16L7.5 11.5M12 16L16.5 11.5M4 17.5V19.5H20V17.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M4.5 7H19.5M9.5 4H14.5M7 7L8 19.5H16L17 7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowRightIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M5 12H19M13.5 6.5L19 12L13.5 17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LogoutIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M10 4H5.5C4.7 4 4 4.7 4 5.5V18.5C4 19.3 4.7 20 5.5 20H10M15 16L19.5 12L15 8M9.5 12H19.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryIcon({ category, className = 'w-6 h-6' }) {
  if (category === 'minecraft') return <MinecraftIcon className={className} />;
  if (category === 'web') return <WebsiteIcon className={className} />;
  if (category === 'discord') return <DiscordBotIcon className={className} />;
  return <AltyapiIcon className={className} />;
}

export function SftpTransferIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <rect x="3" y="4" width="18" height="16" rx="3" fill="rgba(0,240,255,0.12)" stroke="#22d3ee" strokeWidth="1.6" />
      <path d="M8 10L12 6.5L16 10M12 6.5V14.5M8 14L12 17.5L16 14" stroke="#a78bfa" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CollaboratorsIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="9" cy="8" r="3" stroke="#22d3ee" strokeWidth="1.6" />
      <path d="M3.5 19C3.5 16 6 14 9 14C12 14 14.5 16 14.5 19" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17.5 8.5V13.5M15 11H20" stroke="#10b981" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function PaletteMotdIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 3C7 3 3 7 3 12C3 16.5 6.5 20 11 20C12.3 20 13 19.2 13 18.2C13 17.6 12.7 17.1 12.4 16.6C12 16 12.4 15.2 13.2 15.2H15.5C18.5 15.2 21 12.8 21 9.8C21 6 17 3 12 3Z" fill="rgba(167,139,250,0.16)" stroke="#a78bfa" strokeWidth="1.6" />
      <circle cx="7.5" cy="10.5" r="1.2" fill="#00f0ff" />
      <circle cx="11" cy="7.5" r="1.2" fill="#10b981" />
      <circle cx="15.5" cy="8.5" r="1.2" fill="#facc15" />
    </svg>
  );
}

export function WorldGlobeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="12" r="8.5" fill="rgba(16,185,129,0.12)" stroke="#34d399" strokeWidth="1.6" />
      <ellipse cx="12" cy="12" rx="3.8" ry="8.5" stroke="#34d399" strokeWidth="1.4" />
      <path d="M4 9.5H20M4 14.5H20" stroke="#34d399" strokeWidth="1.4" />
    </svg>
  );
}

export function ModCubeIcon({ className = 'w-5 h-5' }) {
  return (
    <svg {...base(className)}>
      <path d="M12 2.5L20 7V17L12 21.5L4 17V7L12 2.5Z" fill="rgba(124,58,237,0.16)" stroke="#a78bfa" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 12L20 7M12 12L4 7M12 12V21.5" stroke="#c4b5fd" strokeWidth="1.5" />
      <circle cx="12" cy="7.5" r="1.4" fill="#00f0ff" />
    </svg>
  );
}

export function CopyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 15H4.5C3.7 15 3 14.3 3 13.5V4.5C3 3.7 3.7 3 4.5 3H13.5C14.3 3 15 3.7 15 4.5V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function EditFileIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <path d="M15.5 4.5L19.5 8.5L8.5 19.5H4.5V15.5L15.5 4.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function ZipExtractIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7V15M12 7L9 10M12 7L15 10M8 17H16" stroke="#22d3ee" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchGlassIcon({ className = 'w-4 h-4' }) {
  return (
    <svg {...base(className)}>
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
