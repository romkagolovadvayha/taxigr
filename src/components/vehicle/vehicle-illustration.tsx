import { Image } from "expo-image";
import { Platform, View } from "react-native";

import { radius } from "@/theme/tokens";
import { useAppTheme } from "@/theme/theme-provider";

const vehiclePhoto = require("../../../assets/tariffs/economy-car.webp");

type Props = {
  colorHex?: string | null;
  width?: number;
  height?: number;
  framed?: boolean;
};

export function VehicleIllustration({
  width = 92,
  height = 48,
  framed = false,
}: Props) {
  const { colors, dark } = useAppTheme();
  const illustration = (
    <View
      style={{
        width,
        height,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: "#FFFFFF",
        // Some Android GL drivers abort when drawing advanced blend equations.
        mixBlendMode: dark || Platform.OS === "android" ? "normal" : "multiply",
      }}
    >
      <Image
        source={vehiclePhoto}
        style={{ width, height }}
        contentFit="contain"
        loading="eager"
        cachePolicy="memory-disk"
        transition={0}
        alt=""
        accessible={false}
      />
    </View>
  );

  if (!framed) return illustration;
  return (
    <View
      style={{
        minWidth: width + 16,
        minHeight: height + 16,
        borderRadius: radius.lg,
        backgroundColor: colors.surfaceSecondary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {illustration}
    </View>
  );
}
