import { SafeAreaView } from 'react-native-safe-area-context';

import { AddressSearchScreen } from '@/screens/passenger/address-search-screen';
import { useThemeColors } from '@/theme/theme-provider';

export default function AddressSearchRoute() {
  const colors = useThemeColors();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.canvas }}>
      <AddressSearchScreen />
    </SafeAreaView>
  );
}
