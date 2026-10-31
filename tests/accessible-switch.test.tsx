import { Children, isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ platform: { OS: 'android' } }));
vi.mock('react-native', () => ({ Platform: mocks.platform, View: 'View' }));
vi.mock('@expo/ui', () => ({ Host: 'NativeHost', Switch: 'NativeSwitch' }));
vi.mock('@/components/ui/animated-pressable', () => ({ AnimatedPressable: 'WebPressable' }));
vi.mock('@/theme/theme-provider', () => ({ useThemeColors: () => ({ brand: '#fc0', borderStrong: '#888', brandInk: '#000', surface: '#fff' }) }));
import { AccessibleSwitch } from '../src/components/ui/accessible-switch';

type Element = ReactElement<Record<string, any>>;
function find(tree: Element, type: string): Element | undefined {
  if (tree.type === type) return tree;
  for (const child of Children.toArray(tree.props.children)) {
    if (isValidElement(child)) {
      const found = find(child as Element, type);
      if (found) return found;
    }
  }
}

beforeEach(() => { mocks.platform.OS = 'android'; });
describe('settings switch input', () => {
  it.each(['android', 'ios'])('handles native changes directly, once in each direction on %s', platform => {
    mocks.platform.OS = platform;
    const change = vi.fn();
    let tree = AccessibleSwitch({ value: false, accessibilityLabel: 'Вибрация', onValueChange: change });
    expect(tree.props.onPress).toBeUndefined();
    const native = find(tree, 'NativeSwitch')!;
    native.props.onValueChange(true);
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
    tree = AccessibleSwitch({ value: true, accessibilityLabel: 'Вибрация', onValueChange: change });
    find(tree, 'NativeSwitch')!.props.onValueChange(false);
    expect(change.mock.calls).toEqual([[true], [false]]);
  });

  it('preserves the accessible name, state and screen-reader activation', () => {
    const change = vi.fn();
    const tree = AccessibleSwitch({ value: false, accessibilityLabel: 'Тёмная тема', onValueChange: change });
    expect(tree.props).toMatchObject({ accessibilityLabel: 'Тёмная тема', accessibilityRole: 'switch', accessibilityState: { checked: false, disabled: false } });
    tree.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
    expect(change).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('does not change a disabled native switch by touch or accessibility', () => {
    const change = vi.fn();
    const tree = AccessibleSwitch({ value: false, disabled: true, accessibilityLabel: 'Push', onValueChange: change });
    const native = find(tree, 'NativeSwitch')!;
    expect(native.props.disabled).toBe(true);
    native.props.onValueChange(true);
    tree.props.onAccessibilityTap();
    expect(change).not.toHaveBeenCalled();
  });

  it('keeps the web control accessible and switches through its press handler', () => {
    mocks.platform.OS = 'web';
    const change = vi.fn();
    const tree = AccessibleSwitch({ value: true, accessibilityLabel: 'Голос', onValueChange: change });
    expect(tree.type).toBe('WebPressable');
    expect(tree.props['aria-checked']).toBe(true);
    tree.props.onPress();
    expect(change).toHaveBeenCalledExactlyOnceWith(false);
  });
});
