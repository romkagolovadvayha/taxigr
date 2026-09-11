import { useIsFocused } from 'expo-router/react-navigation';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

const subscribe = (onChange: () => void) => {
  const subscription = AppState.addEventListener('change', onChange);
  return () => subscription.remove();
};
const getSnapshot = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
const getServerSnapshot = () => true;

export function useForegroundScreen(): boolean {
  const focused = useIsFocused();
  const foreground = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return focused && foreground;
}
