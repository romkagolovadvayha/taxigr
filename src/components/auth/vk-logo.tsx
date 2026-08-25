import Svg, { Path } from 'react-native-svg';

export function VkLogo({ size = 26, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="8 8 33 33"
      accessibilityLabel="VK"
      accessibilityElementsHidden
    >
      <Path
        fill={color}
        d="M25.94 34.59C15.01 34.59 8.77 27.1 8.51 14.65h5.47c.18 9.14 4.21 13.01 7.4 13.81V14.65h5.15v7.88c3.15-.34 6.47-3.93 7.59-7.88h5.15c-.86 4.87-4.45 8.46-7 9.94 2.55 1.2 6.63 4.33 8.18 10h-5.67c-1.22-3.79-4.25-6.72-8.25-7.12v7.12h-.59Z"
      />
    </Svg>
  );
}
