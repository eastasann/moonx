/**
 * The phone component gallery: every public ui-native part and layout pattern with its kinds,
 * sizes and states, plus a header with the theme control and the window width. It is a
 * development tool, not an app screen, so its labels are written here instead of coming from
 * packages/i18n. It needs `UiProvider` above it, which the app root already mounts.
 */
import { useState } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import { Heading } from "../components/Heading";
import { SegmentedControl, SegmentedControlItem } from "../components/SegmentedControl";
import { Text } from "../components/Text";
import { setThemePreference, type ThemePreference } from "../theme";
import { ActionsSection } from "./ActionsSection";
import { AppPartsSection } from "./AppPartsSection";
import { CollectionsSection } from "./CollectionsSection";
import { FeedbackSection } from "./FeedbackSection";
import { FieldsSection } from "./FieldsSection";
import { LayoutSection } from "./LayoutSection";
import { OverlaysSection } from "./OverlaysSection";
import { styles } from "./preview.styles";

const PREFERENCES = ["system", "light", "dark"] as const;

const isPreference = (value: string): value is ThemePreference =>
  (PREFERENCES as readonly string[]).includes(value);

function capitalized(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** The theme in force, the window width, and the breakpoint it falls in. */
function Readout() {
  const { width } = useWindowDimensions();
  const { rt } = useUnistyles();
  return (
    <Text variant="body-sm" tone="secondary">
      {`Theme ${rt.themeName}, window ${Math.round(width)} px, ${capitalized(rt.breakpoint ?? "mobile")} layout`}
    </Text>
  );
}

export function ComponentGallery() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  const choose = (value: string) => {
    if (!isPreference(value)) return;
    setPreference(value);
    setThemePreference(value);
  };

  return (
    <ScrollView
      testID="component-gallery"
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Heading level={1}>Component gallery</Heading>
        <View style={styles.controlRow}>
          <SegmentedControl aria-label="Theme" size="S" value={preference} onChange={choose}>
            <SegmentedControlItem value="system">System</SegmentedControlItem>
            <SegmentedControlItem value="light">Light</SegmentedControlItem>
            <SegmentedControlItem value="dark">Dark</SegmentedControlItem>
          </SegmentedControl>
        </View>
        <Readout />
      </View>
      <ActionsSection />
      <FieldsSection />
      <OverlaysSection />
      <FeedbackSection />
      <CollectionsSection />
      <AppPartsSection />
      <LayoutSection />
    </ScrollView>
  );
}
