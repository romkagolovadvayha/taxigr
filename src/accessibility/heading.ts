import { Platform, type TextProps } from 'react-native';

export function webHeadingLevel(level: 2 | 3): Partial<TextProps> {
  return Platform.OS === 'web'
    ? ({ 'aria-level': level } as unknown as Partial<TextProps>)
    : {};
}
