import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme/tokens';

export type AppIconName =
  | 'back'
  | 'car'
  | 'child-seat'
  | 'chevron'
  | 'check'
  | 'clock'
  | 'close'
  | 'document'
  | 'earnings'
  | 'location'
  | 'menu'
  | 'orders'
  | 'phone'
  | 'profile'
  | 'recenter'
  | 'search'
  | 'settings'
  | 'shield'
  | 'star'
  | 'volume'
  | 'wallet';

type Props = {
  name: AppIconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  filled?: boolean;
};

export function AppIcon({
  name,
  size = 24,
  color = colors.ink,
  strokeWidth = 2,
  filled = false,
}: Props) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'back' && <Path d="M15 18l-6-6 6-6" {...common} />}
      {name === 'car' && (
        <>
          <Path d="M4 15l1.8-5.2A2 2 0 017.7 8h8.6a2 2 0 011.9 1.3L20 15" {...common} />
          <Path d="M3 15h18v4H3zM6 19v2M18 19v2" {...common} />
          <Circle cx="7" cy="16.5" r="1" fill={color} />
          <Circle cx="17" cy="16.5" r="1" fill={color} />
        </>
      )}
      {name === 'child-seat' && (
        <>
          <Circle cx="9" cy="6" r="2" {...common} />
          <Path d="M7 9l2.5 3 2.5-2 3 4M6 9l-2 6h8l3 5M5 15v5M12 15v5" {...common} />
        </>
      )}
      {name === 'chevron' && <Path d="M9 6l6 6-6 6" {...common} />}
      {name === 'check' && <Path d="M5 12.5l4.2 4.2L19 7" {...common} />}
      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="9" {...common} />
          <Path d="M12 7v5l3 2" {...common} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6L6 18" {...common} />}
      {name === 'document' && (
        <>
          <Path d="M6 3h8l4 4v14H6z" {...common} />
          <Path d="M14 3v5h4M9 13h6M9 17h6" {...common} />
        </>
      )}
      {name === 'earnings' && (
        <>
          <Path d="M4 19V9M10 19V5M16 19v-7M22 19H2" {...common} />
        </>
      )}
      {name === 'location' && (
        <>
          <Path d="M12 22s7-5.3 7-12a7 7 0 10-14 0c0 6.7 7 12 7 12z" {...common} />
          <Circle cx="12" cy="10" r="2.5" {...common} />
        </>
      )}
      {name === 'menu' && <Path d="M4 7h16M4 12h16M4 17h16" {...common} />}
      {name === 'orders' && (
        <>
          <Rect x="4" y="3" width="16" height="18" rx="3" {...common} />
          <Path d="M8 8h8M8 12h8M8 16h5" {...common} />
        </>
      )}
      {name === 'phone' && (
        <Path
          d="M7.2 3.5l2.2 4.2-2 1.7a15.6 15.6 0 007.2 7.2l1.7-2 4.2 2.2-.8 3.7c-.2.9-1 1.5-1.9 1.5C9.1 22 2 14.9 2 6.2c0-.9.6-1.7 1.5-1.9z"
          {...common}
        />
      )}
      {name === 'profile' && (
        <>
          <Circle cx="12" cy="8" r="4" {...common} />
          <Path d="M4.5 21a7.5 7.5 0 0115 0" {...common} />
        </>
      )}
      {name === 'recenter' && (
        <>
          <Circle cx="12" cy="12" r="7" {...common} />
          <Circle cx="12" cy="12" r="2" fill={color} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...common} />
        </>
      )}
      {name === 'search' && (
        <>
          <Circle cx="10.5" cy="10.5" r="6.5" {...common} />
          <Path d="M15.5 15.5L21 21" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3" {...common} />
          <Path d="M19 13.5l1.2 1.8-2.1 2.1-1.8-1.2-2.3 1v2.1h-4v-2.1l-2.3-1-1.8 1.2-2.1-2.1L5 13.5l-1-2.3H2V8.3h2l1-2.3-1.2-1.8 2.1-2.1L7.7 3.3l2.3-1V.2h4v2.1l2.3 1 1.8-1.2 2.1 2.1L19 6l1 2.3h2v2.9h-2z" {...common} />
        </>
      )}
      {name === 'shield' && <Path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" {...common} />}
      {name === 'star' && (
        <Path
          d="M12 2l3 6 6.5.9-4.7 4.6 1.1 6.5-5.9-3.1L6.1 20l1.1-6.5-4.7-4.6L9 8z"
          {...common}
          fill={filled ? color : 'none'}
        />
      )}
      {name === 'volume' && (
        <>
          <Path d="M4 10v4h4l5 4V6L8 10H4z" {...common} />
          <Path d="M16 9a4 4 0 010 6M18.5 6.5a7.5 7.5 0 010 11" {...common} />
        </>
      )}
      {name === 'wallet' && (
        <>
          <Rect x="3" y="5" width="18" height="15" rx="3" {...common} />
          <Path d="M3 9h18M15 13h6v4h-6a2 2 0 010-4z" {...common} />
        </>
      )}
    </Svg>
  );
}
