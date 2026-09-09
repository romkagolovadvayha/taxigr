import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandMark } from "@/components/brand-mark";
import { useThemeColors } from "@/theme/theme-provider";

export type AuthScreenLayoutProps = {
  children: ReactNode;
  compact: boolean;
  keyboardOpen: boolean;
};

export function AuthScreenLayout({
  children,
  compact,
  keyboardOpen,
}: AuthScreenLayoutProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{
        flex: 1,
        backgroundColor: colors.surface,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      {!keyboardOpen && (
        <View
          style={{
            paddingHorizontal: 24,
            paddingTop: compact ? 12 : 24,
            paddingBottom: 12,
          }}
        >
          <BrandMark size={32} />
        </View>
      )}
      <View
        style={{
          flex: 1,
          minHeight: 0,
          justifyContent: "center",
          padding: compact ? 16 : 24,
        }}
      >
        <View style={{ width: "100%", maxWidth: 400, alignSelf: "center" }}>
          {children}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
