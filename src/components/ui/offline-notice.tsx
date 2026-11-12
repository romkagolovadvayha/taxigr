import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServerReachable } from '@/offline/connectivity';
import { useThemeColors } from '@/theme/theme-provider';

export function OfflineNotice() {
  const reachable = useServerReachable();
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  if (reachable) return null;
  return <View accessibilityRole="alert" style={{backgroundColor:colors.warningSoft,paddingTop:Math.max(6,insets.top),paddingBottom:6,paddingHorizontal:12}}>
    <Text style={{color:colors.warningText,fontSize:12,lineHeight:17,textAlign:'center'}}>
      Нет связи. Карта и черновик доступны. Статусы заказов обновятся после подключения.
    </Text>
  </View>;
}
