import { getAvatarDef } from './avatarDefs';

function renderShape(id: number, fg: string) {
  switch (id) {
    case 1:
      return <circle cx="32" cy="32" r="14" fill={fg} />;
    case 2:
      return <path d="M32 15 L49 47 L15 47 Z" fill={fg} />;
    case 3:
      return <path d="M32 13 L51 32 L32 51 L13 32 Z" fill={fg} />;
    case 4:
      return <path d="M32 13 L48.5 22.5 L48.5 41.5 L32 51 L15.5 41.5 L15.5 22.5 Z" fill={fg} />;
    case 5:
      return (
        <path
          d="M32 13 L37 26.5 L51 26.5 L39.5 34.8 L44 48 L32 39.7 L20 48 L24.5 34.8 L13 26.5 L27 26.5 Z"
          fill={fg}
        />
      );
    case 6:
      return (
        <path
          d="M13 37 Q22.5 20 32 37 T51 37"
          stroke={fg}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
        />
      );
    case 7:
      return <circle cx="32" cy="32" r="13" fill="none" stroke={fg} strokeWidth="6" />;
    case 8:
      return <path d="M26 15h12v11h11v12H38v11H26V38H15V26h11Z" fill={fg} />;
    default:
      return null;
  }
}

export function AvatarSvg({ id, className }: { id: number; className?: string }) {
  const def = getAvatarDef(id);
  const gradientId = `avatar-bg-${id}`;

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`Avatar ${id}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={def.bg[0]} />
          <stop offset="100%" stopColor={def.bg[1]} />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="32" fill={`url(#${gradientId})`} />
      {renderShape(id, def.fg)}
    </svg>
  );
}
