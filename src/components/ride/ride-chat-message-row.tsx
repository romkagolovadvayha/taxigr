import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveApiUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { IconButton } from '@/components/ui/icon-button';
import type { RideChatMessage, RideChatParticipant } from '@/domain/models';
import { formatRideChatTime } from '@/domain/ride-chat';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';

type RideChatImageSource = {
  uri: string;
  headers?: { Authorization: string };
};

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

function RideChatImagePreview({
  visible,
  source,
  aspectRatio,
  senderName,
  onClose,
}: {
  visible: boolean;
  source: RideChatImageSource;
  aspectRatio: number;
  senderName: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 4 / 3;
  const availableWidth = Math.max(1, window.width - spacing.x8);
  const availableHeight = Math.max(
    1,
    window.height - Math.max(insets.top, spacing.x4) - Math.max(insets.bottom, spacing.x4) - 96,
  );
  const availableAspectRatio = availableWidth / availableHeight;
  const previewWidth = safeAspectRatio >= availableAspectRatio
    ? availableWidth
    : availableHeight * safeAspectRatio;
  const previewHeight = safeAspectRatio >= availableAspectRatio
    ? availableWidth / safeAspectRatio
    : availableHeight;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, visible]);

  return (
    <Modal
      animationType="fade"
      transparent
      visible={visible}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        accessible={false}
        onPress={onClose}
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: spacing.x4,
          paddingTop: Math.max(insets.top, spacing.x4) + 64,
          paddingBottom: Math.max(insets.bottom, spacing.x4),
          backgroundColor: 'rgba(0, 0, 0, 0.94)',
        }}
      >
        <View
          style={{
            position: 'absolute',
            top: Math.max(insets.top, spacing.x4),
            right: spacing.x4,
            zIndex: 1,
          }}
        >
          <IconButton icon="close" label="Закрыть фотографию" onPress={onClose} />
        </View>
        <Pressable
          accessible={false}
          onPress={(event) => event.stopPropagation()}
          style={{
            width: previewWidth,
            height: previewHeight,
            maxWidth: '100%',
            overflow: 'hidden',
            borderRadius: radius.md,
          }}
        >
          <Image
            source={source}
            accessibilityLabel={`Фотография от ${senderName}`}
            accessibilityRole="image"
            cachePolicy="none"
            contentFit="contain"
            transition={motion.duration.quick}
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: colors.ink,
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
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
  const [imagePreviewVisible, setImagePreviewVisible] = useState(false);
  const emphasized = adminView ? message.sender.role === 'driver' : own;
  const alignRight = adminView ? message.sender.role === 'driver' : own;
  const roleLabel = message.sender.role === 'driver' ? 'Водитель' : 'Пассажир';
  const attachmentLabel = message.attachment ? 'Фотография. ' : '';
  const imageAspectRatio = message.attachment?.width && message.attachment.height
    ? message.attachment.width / message.attachment.height
    : 4 / 3;
  const thumbnailAspectRatio = Math.min(1.5, Math.max(0.8, imageAspectRatio));
  const attachmentSource: RideChatImageSource | null = message.attachment
    ? {
        uri: resolveApiUrl(message.attachment.url),
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      }
    : null;

  return (
    <>
      <View
        accessible={!message.attachment}
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
          {!!attachmentSource && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Открыть фотографию от ${message.sender.name}`}
              accessibilityHint="Откроется увеличенная фотография"
              onPress={() => setImagePreviewVisible(true)}
              style={({ pressed }) => ({
                width: 160,
                maxWidth: '100%',
                aspectRatio: thumbnailAspectRatio,
                overflow: 'hidden',
                borderRadius: radius.md,
                backgroundColor: emphasized ? colors.brandSoft : colors.surfaceSecondary,
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Image
                source={attachmentSource}
                accessible={false}
                cachePolicy="none"
                contentFit="cover"
                transition={motion.duration.quick}
                style={{ width: '100%', height: '100%' }}
              />
            </Pressable>
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
      {!!attachmentSource && (
        <RideChatImagePreview
          visible={imagePreviewVisible}
          source={attachmentSource}
          aspectRatio={imageAspectRatio}
          senderName={message.sender.name}
          onClose={() => setImagePreviewVisible(false)}
        />
      )}
    </>
  );
}
