import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export interface PageFrameProps {
  children: ReactNode;
}

/**
 * The `main` landmark of a screen that has no `AppFrame`: the landing page, log in and the other
 * public screens, and onboarding. It adds no look; it only fills the screen so the pattern
 * inside can pin its actions to the bottom. Unlike the Web part it has no `isEmbedded`: the
 * component gallery is a Web page.
 */
export function PageFrame({ children }: PageFrameProps) {
  return (
    <View role="main" style={styles.frame}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ frame: { flex: 1 } });
