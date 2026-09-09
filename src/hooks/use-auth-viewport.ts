import { useEffect, useState } from "react";
import { Keyboard, Platform, useWindowDimensions } from "react-native";

export function useAuthViewport() {
  const dimensions = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const [webKeyboardOpen, setWebKeyboardOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") {
      const viewport = window.visualViewport;
      const resize = () => {
        setWebHeight(viewport?.height ?? window.innerHeight);
        // React Native Web dimensions already follow the visual viewport.
        // Compare with the layout viewport to detect the keyboard instead.
        setWebKeyboardOpen(
          window.innerHeight -
            (viewport?.height ?? window.innerHeight) * (viewport?.scale ?? 1) >
            120,
        );
      };
      resize();
      viewport?.addEventListener("resize", resize);
      window.addEventListener("resize", resize);
      return () => {
        viewport?.removeEventListener("resize", resize);
        window.removeEventListener("resize", resize);
      };
    }
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  const availableHeight =
    Platform.OS === "web"
      ? (webHeight ?? dimensions.height)
      : dimensions.height - (Platform.OS === "ios" ? keyboardHeight : 0);
  return {
    compact: availableHeight < 700,
    tight: availableHeight < 440,
    keyboardOpen: Platform.OS === "web" ? webKeyboardOpen : keyboardHeight > 0,
  };
}
