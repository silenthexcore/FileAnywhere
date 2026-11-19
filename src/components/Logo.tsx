import { useId } from 'react';
import { Folder, ArrowUp } from 'lucide-react';

interface LogoProps {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  showChinese?: boolean;
}

export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`fa-g-${id}`} x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5B7CFF" />
          <stop offset="0.55" stopColor="#4F5BE8" />
          <stop offset="1" stopColor="#7B3FE4" />
        </linearGradient>
        <linearGradient id={`fa-arrow-${id}`} x1="20" y1="24" x2="32" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3F51D9" />
          <stop offset="1" stopColor="#6A3BDA" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#fa-g-${id})`} />
      <rect x="2.5" y="2.5" width="43" height="43" rx="12.5" stroke="white" strokeOpacity="0.16" />
      <path
        d="M13 18.2a3.2 3.2 0 0 1 3.2-3.2h7.1c.9 0 1.8.4 2.4 1l2.5 2.4h5.6a3.2 3.2 0 0 1 3.2 3.2v10.2a3.2 3.2 0 0 1-3.2 3.2H16.2A3.2 3.2 0 0 1 13 31.8V18.2Z"
        fill="white"
        fillOpacity="0.96"
      />
      <path
        d="M24 31.6v-8.8m0 0-3.7 3.7M24 22.8l3.7 3.7"
        stroke={`url(#fa-arrow-${id})`}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 40, className = '', withWordmark = true, showChinese = true }: LogoProps) {
  return (
    <div className={`logo ${className}`}>
      <LogoMark size={size} />
      {withWordmark && (
        <div className="logo-text">
          <div className="logo-name-row">
            <span className="logo-name">FileAnywhere</span>
            {showChinese && <span className="logo-cn">随档</span>}
          </div>
          <span className="logo-tagline">FILES, ANYWHERE</span>
        </div>
      )}
    </div>
  );
}

export function EmptyFolderIllustration() {
  return (
    <div className="empty-illustration" aria-hidden="true">
      <div className="empty-halo" />
      <div className="empty-folder-back">
        <Folder size={74} strokeWidth={1.2} />
      </div>
      <div className="empty-folder-arrow">
        <ArrowUp size={22} strokeWidth={2} />
      </div>
      <span className="empty-dot dot-a" />
      <span className="empty-dot dot-b" />
      <span className="empty-dot dot-c" />
    </div>
  );
}
