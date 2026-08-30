import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { resolveApiUrl } from '@/api/client';
import { useSession } from '@/auth/session-provider';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { IconButton } from '@/components/ui/icon-button';
import type { RideChatMessage, RideChatParticipant } from '@/domain/models';
import { formatRideChatTime } from '@/domain/ride-chat';
import { useRideChat } from '@/hooks/use-ride-chat';
import { colors, radius, spacing, typography } from '@/theme/tokens';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase('ru-RU') ?? '')
    .join('') || '—';
}

function ChatAvatar({ participant, size = 38 }: { participant: RideChatParticipant; size?: number }) {
  const fallback = (
    <View
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
      transition={120}
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

function MessageRow({ message, own }: { message: RideChatMessage; own: boolean }) {
  return (
    <View
      accessibilityLabel={`${message.sender.name}, ${formatRideChatTime(message.createdAt)}: ${message.body}`}
      style={{
        width: '100%',
        flexDirection: own ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: spacing.x2,
      }}
    >
      <ChatAvatar participant={message.sender} size={32} />
      <View
        style={{
          maxWidth: '78%',
          paddingHorizontal: spacing.x4,
          paddingVertical: spacing.x3,
          gap: spacing.x1,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: own ? colors.brand : colors.surface,
          borderWidth: own ? 0 : 1,
          borderColor: colors.border,
        }}
      >
        {!own && (
          <Text selectable style={{ ...typography.micro, color: colors.inkSecondary }}>
            {message.sender.name}
          </Text>
        )}
        <Text selectable style={{ ...typography.body, color: own ? colors.brandInk : colors.ink }}>
          {message.body}
        </Text>
        <Text
          selectable
          style={{
            ...typography.micro,
            color: own ? colors.brandInkSecondary : colors.inkMuted,
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

export function RideChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<RideChatMessage>>(null);
  const previousMessageCount = useRef(0);
  const [draft, setDraft] = useState('');
  const {
    thread,
    loading,
    sending,
    connected,
    error,
    reload,
    sendMessage,
  } = useRideChat(id);

  const messages = thread?.messages ?? [];

  useEffect(() => {
    if (!messages.length || messages.length === previousMessageCount.current) return;
    const animated = previousMessageCount.current > 0;
    previousMessageCount.current = messages.length;
    const timer = setTimeout(() => listRef.current?.scrollToEnd({ animated }), 40);
    return () => clearTimeout(timer);
  }, [messages.length]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    const sent = await sendMessage(body);
    if (sent) setDraft((current) => (current.trim() === body ? '' : current));
  };

  const backFallback = thread?.viewerRole === 'driver' ? '/driver' : '/';

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.canvas }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
          flex: 1,
          paddingTop: Math.max(insets.top, spacing.x2),
        }}
      >
        <View
          style={{
            minHeight: 64,
            paddingHorizontal: spacing.x4,
            paddingBottom: spacing.x3,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.x3,
            borderBottomWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.canvas,
          }}
        >
          <IconButton
            icon="back"
            label="Назад"
            onPress={() => (router.canGoBack() ? router.back() : router.replace(backFallback))}
          />
          {thread?.counterpart && <ChatAvatar participant={thread.counterpart} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              selectable
              numberOfLines={1}
              style={{ ...typography.sectionTitle, color: colors.ink }}
            >
              {thread?.counterpart.name ?? 'Чат поездки'}
            </Text>
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              {connected ? 'Сообщения приходят в реальном времени' : 'Подключение к чату…'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x3 }}>
            <ActivityIndicator color={colors.ink} />
            <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
              Загружаем сообщения…
            </Text>
          </View>
        ) : !thread ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              padding: spacing.x6,
              gap: spacing.x4,
            }}
          >
            <AppIcon name="chat" size={44} color={colors.inkMuted} />
            <Text accessibilityRole="alert" selectable style={{ ...typography.body, color: colors.inkSecondary, textAlign: 'center' }}>
              {error ?? 'Чат этой поездки недоступен'}
            </Text>
            {!!id && (
              <AppButton variant="secondary" onPress={() => void reload()}>
                Попробовать снова
              </AppButton>
            )}
          </View>
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={({ item }) => (
                <MessageRow message={item} own={item.sender.id === user?.id} />
              )}
              contentInsetAdjustmentBehavior="automatic"
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              style={{ flex: 1 }}
              contentContainerStyle={{
                flexGrow: 1,
                justifyContent: messages.length ? 'flex-start' : 'center',
                paddingHorizontal: spacing.x4,
                paddingVertical: spacing.x4,
                gap: spacing.x3,
              }}
              ListEmptyComponent={(
                <View style={{ alignItems: 'center', gap: spacing.x3, padding: spacing.x6 }}>
                  <AppIcon name="chat" size={42} color={colors.inkMuted} />
                  <Text selectable style={{ ...typography.bodyStrong, color: colors.ink, textAlign: 'center' }}>
                    Сообщений пока нет
                  </Text>
                  <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
                    Напишите первое сообщение — оно сразу появится у второго участника поездки.
                  </Text>
                </View>
              )}
            />

            <View
              style={{
                paddingHorizontal: spacing.x4,
                paddingTop: spacing.x3,
                paddingBottom: Math.max(insets.bottom, spacing.x3),
                gap: spacing.x2,
                borderTopWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              {!!error && (
                <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.dangerText }}>
                  {error}
                </Text>
              )}
              {thread.canSend ? (
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.x2 }}>
                  <TextInput
                    accessibilityLabel="Сообщение"
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Напишите сообщение"
                    placeholderTextColor={colors.inkMuted}
                    multiline
                    maxLength={1_000}
                    editable={!sending}
                    style={{
                      flex: 1,
                      minHeight: 52,
                      maxHeight: 120,
                      paddingHorizontal: spacing.x4,
                      paddingVertical: spacing.x3,
                      borderRadius: radius.lg,
                      borderCurve: 'continuous',
                      borderWidth: 1,
                      borderColor: colors.borderStrong,
                      backgroundColor: colors.canvas,
                      color: colors.ink,
                      ...typography.body,
                    }}
                  />
                  <AnimatedPressable
                    accessibilityRole="button"
                    accessibilityLabel="Отправить сообщение"
                    disabled={!draft.trim() || sending}
                    onPress={() => void handleSend()}
                    style={({ pressed }) => ({
                      width: 52,
                      height: 52,
                      borderRadius: radius.pill,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.brand,
                      opacity: !draft.trim() || sending ? 0.42 : pressed ? 0.82 : 1,
                    })}
                  >
                    {sending
                      ? <ActivityIndicator color={colors.brandInk} />
                      : <AppIcon name="send" color={colors.brandInk} size={22} />}
                  </AnimatedPressable>
                </View>
              ) : (
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
                  Чат закрыт, потому что поездка завершена или отменена. История сообщений сохранена.
                </Text>
              )}
            </View>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
