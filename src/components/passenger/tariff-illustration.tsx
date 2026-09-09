import { Image } from "expo-image";
import { View } from "react-native";

import type { TariffCode } from "@/domain/models";
import { useAppTheme } from "@/theme/theme-provider";

import { inlineTariffImageSources, tariffImageSources } from "./tariff-image-sources";

export function TariffIllustration({
  code,
  compact = false,
  inline = false,
}: {
  code: TariffCode;
  compact?: boolean;
  inline?: boolean;
}) {
  const { dark } = useAppTheme();
  const width = inline ? 44 : compact ? 98 : 124;
  const height = inline ? 44 : compact ? 52 : 76;
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        mixBlendMode: dark ? "normal" : "multiply",
      }}
    >
      <Image
        source={(inline ? inlineTariffImageSources : tariffImageSources)[code]}
        contentFit="contain"
        contentPosition="center"
        loading="eager"
        priority="high"
        cachePolicy="memory-disk"
        transition={0}
        accessible={false}
        alt=""
        style={{ width, height }}
      />
    </View>
  );
}
