import { Image } from 'expo-image';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { resolveApiUrl } from '@/api/client';
import { motion, radius, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/theme-provider';

type UserAvatarTone = 'brand' | 'info' | 'danger';

type Props = {
  name: string;
  avatarUrl?: string;
  size?: number;
  tone?: UserAvatarTone;
};

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '')
    .join('') || '—';
}

export function UserAvatar({
  name,
  avatarUrl,
  size = 48,
  tone = 'info',
}: Props) {
  const colors = useThemeColors();
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string>();

  const backgroundColor = tone === 'danger'
    ? colors.dangerSoft
    : tone === 'brand'
      ? colors.brand
      : colors.infoSoft;
  const textColor = tone === 'danger'
    ? colors.dangerText
    : tone === 'brand'
      ? colors.brandInk
      : colors.infoText;
  const commonStyle = {
    width: size,
    height: size,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor,
  } as const;

  if (avatarUrl && failedAvatarUrl !== avatarUrl) {
    return (
      <Image
        source={resolveApiUrl(avatarUrl)}
        accessibilityLabel={`Аватар: ${name}`}
        contentFit="cover"
        recyclingKey={avatarUrl}
        transition={motion.duration.quick}
        onError={() => setFailedAvatarUrl(avatarUrl)}
        style={commonStyle}
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Аватар: ${name}`}
      style={{
        ...commonStyle,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ ...typography.caption, color: textColor, fontWeight: '700' }}>
        {initials(name)}
      </Text>
    </View>
  );
}
