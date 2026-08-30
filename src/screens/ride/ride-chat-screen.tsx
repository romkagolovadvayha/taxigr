import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'react-native-reanimated';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/auth/session-provider';
import {
  RideChatAvatar,
  RideChatMessageRow,
} from '@/components/ride/ride-chat-message-row';
import { AnimatedPressable } from '@/components/ui/animated-pressable';
import { AppButton } from '@/components/ui/app-button';
import { AppIcon } from '@/components/ui/app-icon';
import { AppModal } from '@/components/ui/app-modal';
import { IconButton } from '@/components/ui/icon-button';
import type { RideChatMessage } from '@/domain/models';
import { RIDE_CHAT_IMAGE_MAX_BYTES } from '@/domain/ride-chat';
import { useRideChat, type RideChatImageUpload } from '@/hooks/use-ride-chat';
import { colors, motion, radius, spacing, typography } from '@/theme/tokens';
import { base64ByteLength } from '@/utils/image-data';

type SelectedChatImage = RideChatImageUpload & {
  uri: string;
  sizeBytes: number;
};

const imageOptimizationSteps = [
  { maxDimension: 2_048, compress: 0.78 },
  { maxDimension: 1_800, compress: 0.68 },
  { maxDimension: 1_600, compress: 0.58 },
  { maxDimension: 1_280, compress: 0.48 },
  { maxDimension: 1_024, compress: 0.4 },
] as const;

function formatImageSize(sizeBytes: number): string {
  if (sizeBytes < 1_000_000) return `${Math.max(1, Math.round(sizeBytes / 1_000))} КБ`;
  return `${(sizeBytes / 1_000_000).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} МБ`;
}

function optimizedFileName(fileName: string | null | undefined): string {
  const baseName = (fileName ?? 'photo')
    .replace(/\.[^./\\]+$/u, '')
    .trim()
    .slice(0, 155);
  return `${baseName || 'photo'}.jpg`;
}

async function optimizePickedImage(
  asset: ImagePicker.ImagePickerAsset,
): Promise<SelectedChatImage> {
  for (const step of imageOptimizationSteps) {
    const context = ImageManipulator.manipulate(asset.uri);
    const longestSide = Math.max(asset.width, asset.height);
    if (longestSide > step.maxDimension) {
      context.resize(asset.width >= asset.height
        ? { width: step.maxDimension, height: null }
        : { width: null, height: step.maxDimension });
    }
    const rendered = await context.renderAsync();
    const optimized = await rendered.saveAsync({
      base64: true,
      compress: step.compress,
      format: SaveFormat.JPEG,
    });
    if (!optimized.base64) continue;
    const sizeBytes = base64ByteLength(optimized.base64);
    if (sizeBytes <= RIDE_CHAT_IMAGE_MAX_BYTES) {
      return {
        uri: optimized.uri,
        base64: optimized.base64,
        mimeType: 'image/jpeg',
        sizeBytes,
        width: optimized.width,
        height: optimized.height,
        fileName: optimizedFileName(asset.fileName),
      };
    }
  }
  throw new Error('Не удалось уменьшить фотографию до 5 МБ');
}

export function RideChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const listRef = useRef<FlatList<RideChatMessage>>(null);
  const attachmentButtonRef = useRef<View>(null);
  const previousMessageCount = useRef(0);
  const [draft, setDraft] = useState('');
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<SelectedChatImage | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [cameraPermissionBlocked, setCameraPermissionBlocked] = useState(false);
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

  const acceptPickerResult = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.uri) {
      setPickerError('Не удалось прочитать выбранную фотографию');
      return;
    }
    setPreparingImage(true);
    setPickerError(null);
    try {
      const optimized = await optimizePickedImage(asset);
      setCameraPermissionBlocked(false);
      setSelectedImage(optimized);
    } catch (reason) {
      setPickerError(reason instanceof Error
        ? reason.message
        : 'Не удалось оптимизировать выбранную фотографию');
    } finally {
      setPreparingImage(false);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (!result) return;
        if ('code' in result) {
          setPickerError('Не удалось восстановить выбранную фотографию');
          return;
        }
        void acceptPickerResult(result);
      })
      .catch(() => setPickerError('Не удалось восстановить выбранную фотографию'));
  }, [acceptPickerResult]);

  useEffect(() => {
    if (!messages.length || messages.length === previousMessageCount.current) return;
    const animated = previousMessageCount.current > 0 && !reduceMotion;
    previousMessageCount.current = messages.length;
    const frame = requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated }));
    return () => cancelAnimationFrame(frame);
  }, [messages.length, reduceMotion]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body && !selectedImage) return;
    const attachment = selectedImage
      ? {
          base64: selectedImage.base64,
          mimeType: selectedImage.mimeType,
          ...(selectedImage.width ? { width: selectedImage.width } : {}),
          ...(selectedImage.height ? { height: selectedImage.height } : {}),
          ...(selectedImage.fileName ? { fileName: selectedImage.fileName } : {}),
        }
      : undefined;
    const sent = await sendMessage(body, attachment);
    if (sent) {
      setDraft((current) => (current.trim() === body ? '' : current));
      setSelectedImage(null);
      setPickerError(null);
    }
  };

  const takePhoto = async () => {
    setAttachmentMenuOpen(false);
    setPickerError(null);
    setCameraPermissionBlocked(false);
    try {
      if (Platform.OS !== 'web') {
        await new Promise((resolve) => setTimeout(resolve, motion.duration.sheet));
      }
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          setCameraPermissionBlocked(!permission.canAskAgain);
          setPickerError(permission.canAskAgain
            ? 'Разрешите доступ к камере, чтобы сделать снимок'
            : 'Доступ к камере запрещён. Откройте настройки приложения и разрешите камеру');
          return;
        }
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        cameraType: ImagePicker.CameraType.back,
        quality: 0.9,
      });
      await acceptPickerResult(result);
    } catch {
      setPickerError('Не удалось открыть камеру');
    }
  };

  const chooseFromGallery = async () => {
    setAttachmentMenuOpen(false);
    setPickerError(null);
    setCameraPermissionBlocked(false);
    try {
      if (Platform.OS !== 'web') {
        await new Promise((resolve) => setTimeout(resolve, motion.duration.sheet));
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      await acceptPickerResult(result);
    } catch {
      setPickerError('Не удалось открыть галерею');
    }
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
          {thread?.counterpart && <RideChatAvatar participant={thread.counterpart} />}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              accessibilityRole="header"
              selectable
              numberOfLines={1}
              style={{ ...typography.sectionTitle, color: colors.ink }}
            >
              {thread?.counterpart?.name ?? 'Чат поездки'}
            </Text>
            <Text
              accessibilityLiveRegion="polite"
              role="status"
              selectable
              style={{ ...typography.caption, color: colors.inkSecondary }}
            >
              {connected ? 'Сообщения приходят в реальном времени' : 'Подключение к чату…'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.x3 }}>
            <ActivityIndicator accessibilityLabel="Загружаем сообщения" color={colors.ink} />
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
              accessibilityLabel="Сообщения поездки"
              accessibilityLiveRegion="polite"
              role="log"
              data={messages}
              keyExtractor={(message) => message.id}
              renderItem={({ item }) => (
                <RideChatMessageRow message={item} own={item.sender.id === user?.id} />
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
              {!!(error || pickerError) && (
                <View style={{ alignItems: 'flex-start', gap: spacing.x2 }}>
                  <Text accessibilityRole="alert" selectable style={{ ...typography.caption, color: colors.dangerText }}>
                    {pickerError ?? error}
                  </Text>
                  {cameraPermissionBlocked && (
                    <AppButton
                      compact
                      fullWidth={false}
                      variant="secondary"
                      onPress={() => void Linking.openSettings().catch(() => {
                        setPickerError('Не удалось открыть настройки приложения');
                      })}
                    >
                      Открыть настройки
                    </AppButton>
                  )}
                </View>
              )}
              {thread.canSend ? (
                <View style={{ gap: spacing.x2 }}>
                  {preparingImage && (
                    <View
                      accessibilityLiveRegion="polite"
                      role="status"
                      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.x2 }}
                    >
                      <ActivityIndicator size="small" color={colors.inkSecondary} />
                      <Text selectable style={{ ...typography.caption, color: colors.inkSecondary }}>
                        Оптимизируем фотографию…
                      </Text>
                    </View>
                  )}
                  {!!selectedImage && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.x3,
                        padding: spacing.x2,
                        borderRadius: radius.lg,
                        borderCurve: 'continuous',
                        borderWidth: 1,
                        borderColor: colors.border,
                        backgroundColor: colors.canvas,
                      }}
                    >
                      <Image
                        source={selectedImage.uri}
                        accessible={false}
                        contentFit="cover"
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: radius.md,
                          backgroundColor: colors.surfaceSecondary,
                        }}
                      />
                      <View style={{ flex: 1, minWidth: 0, gap: spacing.x1 }}>
                        <Text numberOfLines={1} style={{ ...typography.caption, color: colors.ink }}>
                          Фотография оптимизирована и готова к отправке
                        </Text>
                        <Text style={{ ...typography.micro, color: colors.inkSecondary }}>
                          {formatImageSize(selectedImage.sizeBytes)}
                        </Text>
                      </View>
                      <IconButton
                        icon="close"
                        label="Убрать фотографию"
                        disabled={sending || preparingImage}
                        size={40}
                        onPress={() => setSelectedImage(null)}
                      />
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.x2 }}>
                    <IconButton
                      ref={attachmentButtonRef}
                      icon="paperclip"
                      label="Прикрепить фотографию"
                      disabled={sending || preparingImage}
                      size={52}
                      onPress={() => setAttachmentMenuOpen(true)}
                    />
                    <TextInput
                      accessibilityLabel="Сообщение"
                      value={draft}
                      onChangeText={setDraft}
                      placeholder={selectedImage ? 'Добавить подпись' : 'Напишите сообщение'}
                      placeholderTextColor={colors.inkSecondary}
                      multiline
                      scrollEnabled
                      textAlignVertical="center"
                      maxLength={1_000}
                      editable={!sending}
                      style={{
                        flex: 1,
                        height: 52,
                        paddingHorizontal: spacing.x4,
                        paddingVertical: 0,
                        borderRadius: radius.lg,
                        borderCurve: 'continuous',
                        borderWidth: 1,
                        borderColor: colors.inkSecondary,
                        backgroundColor: colors.canvas,
                        color: colors.ink,
                        ...typography.body,
                      }}
                    />
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={selectedImage && !draft.trim()
                        ? 'Отправить фотографию'
                        : 'Отправить сообщение'}
                      aria-busy={sending || preparingImage}
                      disabled={(!draft.trim() && !selectedImage) || sending || preparingImage}
                      onPress={() => void handleSend()}
                      style={({ pressed }) => ({
                        width: 52,
                        height: 52,
                        borderRadius: radius.pill,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.brand,
                        opacity: (!draft.trim() && !selectedImage) || sending || preparingImage
                          ? 0.42
                          : pressed
                            ? 0.82
                            : 1,
                      })}
                    >
                      {sending
                        ? <ActivityIndicator color={colors.brandInk} />
                        : <AppIcon name="send" color={colors.brandInk} size={22} />}
                    </AnimatedPressable>
                  </View>
                </View>
              ) : (
                <Text selectable style={{ ...typography.caption, color: colors.inkSecondary, textAlign: 'center' }}>
                  Чат закрыт, потому что поездка завершена или отменена. История сообщений сохранена.
                </Text>
              )}
            </View>
          </>
        )}
        <AppModal
          visible={attachmentMenuOpen}
          title="Прикрепить фотографию"
          description="Сделайте снимок или выберите фотографию из галереи. Мы автоматически уменьшим её; максимальный размер после оптимизации — 5 МБ."
          returnFocusRef={attachmentButtonRef}
          onClose={() => setAttachmentMenuOpen(false)}
        >
          <AppButton
            variant="secondary"
            icon={<AppIcon name="camera" size={22} color={colors.ink} />}
            onPress={() => void takePhoto()}
          >
            Сфотографировать
          </AppButton>
          <AppButton
            variant="secondary"
            icon={<AppIcon name="image" size={22} color={colors.ink} />}
            onPress={() => void chooseFromGallery()}
          >
            Выбрать из галереи
          </AppButton>
        </AppModal>
      </View>
    </KeyboardAvoidingView>
  );
}
