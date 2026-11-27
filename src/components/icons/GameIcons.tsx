import React from 'react';
import type { Faction, PublicFactionGroup, RitualType } from '../../engine/types';

interface IconProps {
  size?: number;
  className?: string;
}

/** Sailor Medallion: Nautical blue circle + rope border + silver anchor */
export const SailorIcon: React.FC<IconProps> = ({ size = 40, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="32" r="29" fill="#1C5885" stroke="#D8C292" strokeWidth="3.5" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#9AC6E6" strokeWidth="1.5" strokeDasharray="4 3" />
    <g fill="none" stroke="#F6F9FC" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="32" cy="18" r="4.5" />
      <line x1="32" y1="22.5" x2="32" y2="47" />
      <line x1="22" y1="28" x2="42" y2="28" />
      <path d="M18 37c2 7 7.5 11 14 11s12-4 14-11" />
      <path d="M16 40l2-4 4 2" />
      <path d="M48 40l-2-4-4 2" />
    </g>
  </svg>
);

/** Pirate Medallion: Crimson circle + rope border + skull & crossed cutlasses */
export const PirateIcon: React.FC<IconProps> = ({ size = 40, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="32" r="29" fill="#8C1D24" stroke="#D8C292" strokeWidth="3.5" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#F0A5AA" strokeWidth="1.5" strokeDasharray="4 3" />
    <g stroke="#FBF6EE" strokeWidth="2.8" strokeLinecap="round">
      <line x1="17" y1="45" x2="47" y2="22" />
      <line x1="47" y1="45" x2="17" y2="22" />
    </g>
    <path
      d="M22 28c0-6.5 4.5-11 10-11s10 4.5 10 11c0 4-2 6.5-4 8v4H26v-4c-2-1.5-4-4-4-8z"
      fill="#FBF6EE"
      stroke="#3D0C10"
      strokeWidth="1.8"
    />
    <circle cx="28" cy="28" r="2.5" fill="#3D0C10" />
    <circle cx="36" cy="28" r="2.5" fill="#3D0C10" />
    <path d="M30.5 34h3M29 38v2M32 38v2M35 38v2" stroke="#3D0C10" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/** Cult Leader Medallion: Antique gold circle + golden Kraken */
export const CultLeaderIcon: React.FC<IconProps> = ({ size = 40, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="32" r="29" fill="#B48A26" stroke="#F2D88A" strokeWidth="3.5" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#5E430A" strokeWidth="1.5" strokeDasharray="4 3" />
    <path
      d="M32 13c-6.5 0-11 4.8-11 11.2 0 4.2 2 7.5 4.5 9.3-3 2.5-9 5-10.8 9.8-1.2 3.2 1.4 5.5 4.2 3.8 2.4-1.4 3.5-4.3 6.6-5.8-1.4 4-2.5 8.8.8 11 2.4 1.6 4.4-.8 4.4-3.6 0-2.5.6-4.8 1.3-6.4.7 1.6 1.3 3.9 1.3 6.4 0 2.8 2 5.2 4.4 3.6 3.3-2.2 2.2-7 .8-11 3.1 1.5 4.2 4.4 6.6 5.8 2.8 1.7 5.4-.6 4.2-3.8-1.8-4.8-7.8-7.3-10.8-9.8 2.5-1.8 4.5-5.1 4.5-9.3C43 17.8 38.5 13 32 13z"
      fill="#FFF4D1"
      stroke="#4D3506"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <circle cx="28" cy="24" r="2.2" fill="#4D3506" />
    <circle cx="36" cy="24" r="2.2" fill="#4D3506" />
  </svg>
);

/** Cultist Medallion: Deep sea-emerald circle + hooded cultist emblem */
export const CultistIcon: React.FC<IconProps> = ({ size = 40, className }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
    <circle cx="32" cy="32" r="29" fill="#1D6447" stroke="#D8C292" strokeWidth="3.5" />
    <circle cx="32" cy="32" r="24" fill="none" stroke="#8BD6B4" strokeWidth="1.5" strokeDasharray="4 3" />
    <path
      d="M32 13c-9 0-14 8-14 19 0 7 2 12 4 15h20c2-3 4-8 4-15 0-11-5-19-14-19z"
      fill="#103928"
      stroke="#DDF5EA"
      strokeWidth="2.2"
    />
    <ellipse cx="32" cy="30" rx="7.5" ry="9" fill="#0B2219" />
    <circle cx="29" cy="29" r="1.8" fill="#E8C76A" />
    <circle cx="35" cy="29" r="1.8" fill="#E8C76A" />
    <path d="M25 43c2.5-2.5 5-3.5 7-3.5s4.5 1 7 3.5" fill="none" stroke="#8BD6B4" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const FactionIcon: React.FC<{ faction: Faction | PublicFactionGroup; size?: number }> = ({
  faction,
  size = 40,
}) => {
  switch (faction) {
    case 'sailor':
      return <SailorIcon size={size} />;
    case 'pirate':
      return <PirateIcon size={size} />;
    case 'cult_leader':
      return <CultLeaderIcon size={size} />;
    case 'cultist':
    case 'cult':
      return <CultistIcon size={size} />;
  }
};

/** Teal Hex Wrapper for Map Actions */
const MapHexBase: React.FC<{ size?: number; children: React.ReactNode }> = ({
  size = 42,
  children,
}) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <polygon
      points="32,4 57,18 57,46 32,60 7,46 7,18"
      fill="#498D9E"
      stroke="#255666"
      strokeWidth="3.2"
      strokeLinejoin="round"
    />
    <polygon
      points="32,9 52,20.5 52,43.5 32,55 12,43.5 12,20.5"
      fill="none"
      stroke="#8AC7D4"
      strokeWidth="1.2"
    />
    {children}
  </svg>
);

export const CabinSearchHexIcon: React.FC<IconProps> = ({ size = 42 }) => (
  <MapHexBase size={size}>
    <circle cx="29" cy="28" r="9.5" fill="#DDF2F7" stroke="#1E353E" strokeWidth="2.8" />
    <line x1="36" y1="35" x2="46" y2="45" stroke="#1E353E" strokeWidth="4.2" strokeLinecap="round" />
    <path d="M25 25a5 5 0 0 1 6-2" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
  </MapHexBase>
);

export const FloggingHexIcon: React.FC<IconProps> = ({ size = 42 }) => (
  <MapHexBase size={size}>
    <path d="M22 44l10-12" stroke="#4D2915" strokeWidth="4.5" strokeLinecap="round" />
    <path
      d="M32 32c5-6 12-10 14-6s-6 10-2 15M32 32c3-8 6-14 10-13M32 32c-2-7 1-14 5-15"
      fill="none"
      stroke="#7A1D22"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
  </MapHexBase>
);

export const CutTongueHexIcon: React.FC<IconProps> = ({ size = 42 }) => (
  <MapHexBase size={size}>
    <path d="M20 44l19-21 5-3-3 5-19 21z" fill="#E8EEF2" stroke="#1E2C33" strokeWidth="2" strokeLinejoin="round" />
    <line x1="17" y1="39" x2="25" y2="47" stroke="#5A3018" strokeWidth="3.5" strokeLinecap="round" />
    <line x1="15" y1="49" x2="21" y2="43" stroke="#3D1E0E" strokeWidth="4" strokeLinecap="round" />
  </MapHexBase>
);

export const FeedKrakenHexIcon: React.FC<IconProps> = ({ size = 42 }) => (
  <MapHexBase size={size}>
    <path
      d="M32 15c-5 0-8.5 3.6-8.5 8.2 0 3 1.5 5.4 3.4 6.8-2.4 2-6.8 3.8-8 7.4-.9 2.3 1 4 3.1 2.7 1.8-1 2.7-3.1 5-4.3-1 3-1.8 6.5.6 8.2 1.8 1.2 3.3-.6 3.3-2.6 0-1.9.5-3.6 1.1-4.8.6 1.2 1.1 2.9 1.1 4.8 0 2 1.5 3.8 3.3 2.6 2.4-1.7 1.6-5.2.6-8.2 2.3 1.2 3.2 3.3 5 4.3 2.1 1.3 4-.4 3.1-2.7-1.2-3.6-5.6-5.4-8-7.4 1.9-1.4 3.4-3.8 3.4-6.8 0-4.6-3.5-8.2-8.5-8.2z"
      fill="#E8C258"
      stroke="#3B2B08"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="29.5" cy="23" r="1.5" fill="#2A1D06" />
    <circle cx="34.5" cy="23" r="1.5" fill="#2A1D06" />
  </MapHexBase>
);

/** Cult Ritual Illustrations */
export const RitualIcon: React.FC<{ ritual: RitualType; size?: number }> = ({
  ritual,
  size = 42,
}) => {
  if (ritual === 'conversion') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="10" fill="#1D6447" stroke="#C99B3B" strokeWidth="3" />
        <path
          d="M32 14c-8 0-12.5 7-12.5 17 0 6.2 1.8 10.8 3.6 13.5h17.8c1.8-2.7 3.6-7.3 3.6-13.5 0-10-4.5-17-12.5-17z"
          fill="#103928"
          stroke="#DDF5EA"
          strokeWidth="2.2"
        />
        <ellipse cx="32" cy="29.5" rx="6.8" ry="8" fill="#0B2219" />
        <circle cx="29.3" cy="28.8" r="1.7" fill="#E8C76A" />
        <circle cx="34.7" cy="28.8" r="1.7" fill="#E8C76A" />
        <path
          d="M25.5 42c2.2-2.2 4.4-3 6.5-3s4.3.8 6.5 3"
          fill="none"
          stroke="#8BD6B4"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (ritual === 'gun_stash') {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect x="6" y="6" width="52" height="52" rx="10" fill="#3D2A1C" stroke="#C99B3B" strokeWidth="3" />
        <g fill="#E9D6A5" stroke="#1E130B" strokeWidth="1.8" strokeLinejoin="round">
          <path d="M16 25h24l4-3v6l-4 1H24l-5 8h-5l3-8-1-4z" />
          <path d="M22 39h24l4-3v6l-4 1H30l-5 8h-5l3-8-1-4z" />
        </g>
        <circle cx="48" cy="18" r="8" fill="#8C1D24" stroke="#F0D084" strokeWidth="1.8" />
        <text x="48" y="22" textAnchor="middle" fill="#FFF" fontSize="11" fontWeight="800">3</text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="6" y="6" width="52" height="52" rx="10" fill="#2B3242" stroke="#C99B3B" strokeWidth="3" />
      <path d="M14 32c5-10 12-14 18-14s13 4 18 14c-5 10-12 14-18 14s-13-4-18-14z" fill="#F2E2B3" stroke="#1F150B" strokeWidth="2" />
      <circle cx="32" cy="32" r="7.5" fill="#1D6447" stroke="#1F150B" strokeWidth="1.8" />
      <circle cx="32" cy="32" r="3" fill="#111" />
    </svg>
  );
};

/** Navigation Card Icons for Player Aid */
export const NavDrunkIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <rect x="18" y="6" width="12" height="8" rx="2" fill="#8C5B32" stroke="#2B180B" strokeWidth="2" />
    <path d="M18 14l-5 8v18a3 3 0 0 0 3 3h16a3 3 0 0 0 3-3V22l-5-8z" fill="#6F8C58" stroke="#2B180B" strokeWidth="2" />
    <rect x="15" y="24" width="18" height="10" fill="#F2E4C2" stroke="#2B180B" strokeWidth="1.5" />
    <text x="24" y="31.5" textAnchor="middle" fontSize="7" fontWeight="800" fill="#3B2313">RUM</text>
  </svg>
);

export const NavMermaidIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="14" r="6" fill="#E8C29B" stroke="#2B180B" strokeWidth="2" />
    <path d="M18 22c3-2 9-2 12 0l-2 11c-2 5 4 7 7 9-6 2-11 0-13-3-2 3-7 5-13 3 3-2 9-4 7-9z" fill="#498D9E" stroke="#1D3C45" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

export const NavTelescopeIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <g transform="rotate(-32 24 24)">
      <rect x="8" y="19" width="12" height="10" rx="2" fill="#B48A26" stroke="#2B180B" strokeWidth="2" />
      <rect x="20" y="20.5" width="11" height="7" fill="#D9B45A" stroke="#2B180B" strokeWidth="2" />
      <rect x="31" y="21.5" width="9" height="5" rx="1" fill="#F0D890" stroke="#2B180B" strokeWidth="2" />
    </g>
  </svg>
);

export const NavArmingIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="22" cy="24" r="13" fill="none" stroke="#6B4423" strokeWidth="3.5" />
    <circle cx="22" cy="24" r="4" fill="#6B4423" />
    <path d="M22 7v34M5 24h34M10 12l24 24M34 12L10 36" stroke="#6B4423" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="35" cy="35" r="9" fill="#1D7A46" stroke="#FFF" strokeWidth="2" />
    <path d="M35 31v8M31 35h8" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export const NavDisarmIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="22" cy="24" r="13" fill="none" stroke="#6B4423" strokeWidth="3.5" />
    <circle cx="22" cy="24" r="4" fill="#6B4423" />
    <path d="M22 7v34M5 24h34M10 12l24 24M34 12L10 36" stroke="#6B4423" strokeWidth="2.5" strokeLinecap="round" />
    <circle cx="35" cy="35" r="9" fill="#A6222B" stroke="#FFF" strokeWidth="2" />
    <path d="M31 35h8" stroke="#FFF" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

export const NavCultUprisingIcon: React.FC<IconProps> = ({ size = 38 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="18" fill="#DFC878" stroke="#4D3506" strokeWidth="2.2" />
    <path d="M16 32c0-9 5-16 12-16 4 0 7 3 7 7s-3 7-7 7c-2.5 0-4.5-2-4.5-4.5S25.5 21 28 21" fill="none" stroke="#2A1D06" strokeWidth="3" strokeLinecap="round" />
    <circle cx="28" cy="25.5" r="2" fill="#8C1D24" />
  </svg>
);

export const CompassIcon: React.FC<IconProps> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="20" fill="#2D1B12" stroke="#C99B3B" strokeWidth="2.5" />
    <polygon points="24,6 28,24 24,20 20,24" fill="#E8C258" />
    <polygon points="24,42 28,24 24,28 20,24" fill="#9E3138" />
    <polygon points="6,24 24,20 20,24 24,28" fill="#C99B3B" />
    <polygon points="42,24 24,20 28,24 24,28" fill="#C99B3B" />
    <circle cx="24" cy="24" r="3" fill="#FFF4D1" />
  </svg>
);

export const WaxSealIcon: React.FC<IconProps> = ({ size = 46 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
    <path
      d="M32 10c-7 0-12 5-12 12 0 4.5 2 8 5 10-3 2.5-9.5 5-11.5 10.5-1.2 3.2 1.5 5.5 4.5 3.8 2.5-1.4 3.8-4.5 7-6-1.5 4.2-2.6 9.2.8 11.6 2.5 1.7 4.6-.8 4.6-3.8 0-2.6.6-5 1.6-6.8 1 1.8 1.6 4.2 1.6 6.8 0 3 2.1 5.5 4.6 3.8 3.4-2.4 2.3-7.4.8-11.6 3.2 1.5 4.5 4.6 7 6 3 1.7 5.7-.6 4.5-3.8C48.5 37 42 34.5 39 32c3-2 5-5.5 5-10 0-7-5-12-12-12z"
      fill="currentColor"
    />
  </svg>
);
