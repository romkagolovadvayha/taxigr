import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { resolveApiUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import type { RideChatMessage, RideChatParticipant } from '@/domain/models';
import { formatRideChatTime } from '@/domain/ride-chat';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '')
    .join('') || '—';
}

export function RideChatAvatar({
  participant,
  size = spacing.x10,
}: {
  participant: RideChatParticipant;
  size?: number;
}) {
  const fallback = (
    <View
      accessible
      accessibilityLabel={`Аватар: ${participant.name}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: participant.role === 'driver' ? colors.brand : colors.infoSoft,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          ...typography.caption,
          color: participant.role === 'driver' ? colors.brandInk : colors.infoText,
          fontWeight: '700',
        }}
      >
        {initials(participant.name)}
      </Text>
    </View>
  );

  if (!participant.avatarUrl) return fallback;

  return (
    <Image
      source={resolveApiUrl(participant.avatarUrl)}
      accessibilityLabel={`Аватар: ${participant.name}`}
      contentFit="cover"
      transition={motion.duration.quick}
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surfaceSecondary,
      }}
    />
  );
}

export function RideChatMessageRow({
  message,
  own = false,
  adminView = false,
}: {
  message: RideChatMessage;
  own?: boolean;
  adminView?: boolean;
}) {
  const { token } = useSession();
  const emphasized = adminView ? message.sender.role === 'driver' : own;
  const alignRight = adminView ? message.sender.role === 'driver' : own;
  const roleLabel = message.sender.role === 'driver' ? 'Водитель' : 'Пассажир';
  const attachmentLabel = message.attachment ? 'Фотография. ' : '';
  const imageAspectRatio = message.attachment?.width && message.attachment.height
    ? Math.min(1.8, Math.max(0.65, message.attachment.width / message.attachment.height))
    : 4 / 3;

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${roleLabel} ${message.sender.name}, ${formatRideChatTime(message.createdAt)}: ${attachmentLabel}${message.body}`}
      style={{
        width: '100%',
        flexDirection: alignRight ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: spacing.x2,
      }}
    >
      <RideChatAvatar participant={message.sender} size={spacing.x8} />
      <View
        style={{
          maxWidth: '78%',
          paddingHorizontal: spacing.x4,
          paddingVertical: spacing.x3,
          gap: spacing.x1,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: emphasized ? colors.brand : colors.surface,
          borderWidth: emphasized ? 0 : 1,
          borderColor: colors.border,
        }}
      >
        {(adminView || !own) && (
          <Text
            selectable
            style={{
              ...typography.micro,
              color: emphasized ? colors.brandInkSecondary : colors.inkSecondary,
            }}
          >
            {message.sender.name} · {roleLabel}
          </Text>
        )}
        {!!message.attachment && (
          <Image
            source={{
              uri: resolveApiUrl(message.attachment.url),
              ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
            }}
            accessible={false}
            cachePolicy="none"
            contentFit="cover"
            transition={motion.duration.quick}
            style={{
              width: 220,
              maxWidth: '100%',
              aspectRatio: imageAspectRatio,
              borderRadius: radius.md,
              backgroundColor: emphasized ? colors.brandSoft : colors.surfaceSecondary,
            }}
          />
        )}
        {!!message.body && (
          <Text
            selectable
            style={{ ...typography.body, color: emphasized ? colors.brandInk : colors.ink }}
          >
            {message.body}
          </Text>
        )}
        <Text
          selectable
          style={{
            ...typography.micro,
            color: emphasized ? colors.brandInkSecondary : colors.inkSecondary,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatRideChatTime(message.createdAt)}
        </Text>
      </View>
    </View>
  );
}
