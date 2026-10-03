import { UiProvider, useDisplayFont } from "@moonx/ui-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

// Without this the native splash hides as soon as the root layout renders, even when it renders
// nothing, and a cold start shows a blank screen until the display font is ready.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fontReady = useDisplayFont();
  useEffect(() => {
    if (fontReady) SplashScreen.hideAsync();
  }, [fontReady]);
  if (!fontReady) return null;
  return (
    <UiProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </UiProvider>
  );
}
