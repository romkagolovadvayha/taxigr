import Svg, { Path } from 'react-native-svg';

export function TelegramLogo({ size = 26 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityLabel="Telegram">
      <Path
        fill="#FFFFFF"
        d="M21.72 2.28a1.02 1.02 0 0 0-1.05-.2L2.55 9.06c-.86.33-.82 1.56.06 1.84l4.58 1.44 1.77 5.57c.27.85 1.38 1.04 1.92.33l2.52-3.32 4.83 3.55c.67.49 1.62.1 1.76-.72l2.06-14.5a1.02 1.02 0 0 0-.33-.97ZM9.63 16.1l-.93-2.93 7.9-6.86-6.1 7.54-.87 2.25Z"
      />
    </Svg>
  );
}
