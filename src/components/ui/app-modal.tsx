import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { IconButton } from '@/components/ui/icon-button';
import { colors, layout, radius, spacing, typography } from '@/theme/tokens';

type Props = {
  visible: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  returnFocusRef?: RefObject<View | null>;
  initialFocusRef?: RefObject<View | null>;
};

type FocusableWebNode = HTMLElement & { focus: () => void };

export function AppModal({
  visible,
  title,
  description,
  children,
  onClose,
  returnFocusRef,
  initialFocusRef,
}: Props) {
  const dialogRef = useRef<View>(null);
  const wasVisible = useRef(false);
  const previousWebFocus = useRef<FocusableWebNode | null>(null);

  useEffect(() => {
    if (visible && !wasVisible.current && Platform.OS === 'web' && typeof document !== 'undefined') {
      previousWebFocus.current = document.activeElement as FocusableWebNode | null;
    }
    if (!visible && wasVisible.current) {
      if (Platform.OS === 'web') {
        const returnTarget =
          (returnFocusRef?.current as unknown as FocusableWebNode | null) ?? previousWebFocus.current;
        returnTarget?.focus?.();
      } else if (returnFocusRef?.current) {
        const handle = findNodeHandle(returnFocusRef.current);
        if (handle) {
          requestAnimationFrame(() => AccessibilityInfo.setAccessibilityFocus(handle));
        }
      }
    }
    wasVisible.current = visible;
  }, [returnFocusRef, visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current as unknown as HTMLElement | null;
      const focusable = dialog?.querySelectorAll<FocusableWebNode>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) {
        event.preventDefault();
        (dialog as FocusableWebNode | null)?.focus?.();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, visible]);

  const focusDialog = () => {
    const target = initialFocusRef?.current ?? dialogRef.current;
    if (!target) return;
    if (Platform.OS === 'web') {
      const dialog = dialogRef.current as unknown as HTMLElement | null;
      const firstFocusable = dialog?.querySelector<FocusableWebNode>(
        '[autofocus], input:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]',
      );
      if (firstFocusable) firstFocusable.focus();
      else (target as unknown as FocusableWebNode).focus?.();
      return;
    }
    const handle = findNodeHandle(target);
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  };

  return (
    <Modal
      animationType="fade"
      accessibilityLabel={Platform.OS === 'web' ? title : undefined}
      transparent
      visible={visible}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
      onShow={focusDialog}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.x4,
          backgroundColor: colors.overlay,
        }}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={{ position: 'absolute', inset: layout.fullInset }}
        />
        <View
          ref={dialogRef}
          accessible={Platform.OS !== 'web'}
          accessibilityViewIsModal={Platform.OS !== 'web'}
          accessibilityLabel={Platform.OS === 'web' ? undefined : title}
          role={Platform.OS === 'web' ? undefined : 'dialog'}
          tabIndex={-1}
          style={{
            width: '100%',
            maxWidth: layout.modalWidth,
            maxHeight: layout.modalMaxHeight,
            borderRadius: radius.card,
            borderCurve: 'continuous',
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            padding: spacing.x5,
            gap: spacing.x4,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.x3 }}>
            <View style={{ flex: 1, gap: spacing.x2 }}>
              <Text accessibilityRole="header" style={{ ...typography.sectionTitle, color: colors.ink }}>
                {title}
              </Text>
              {!!description && (
                <Text style={{ ...typography.body, color: colors.inkSecondary }}>
                  {description}
                </Text>
              )}
            </View>
            <IconButton icon="close" label="Закрыть" onPress={onClose} />
          </View>
          {children}
        </View>
      </View>
    </Modal>
  );
}
