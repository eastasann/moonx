/**
 * Building blocks of the component gallery. The gallery is a development tool, not an app screen,
 * so its labels are written directly instead of coming from packages/i18n.
 */
import { COMPONENT_SIZES, type ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { Heading } from "../components/Heading";
import { Text } from "../components/Text";
import { styles } from "./preview.styles";

export const SIZES = COMPONENT_SIZES;

export function GallerySection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View testID={`gallery-section-${id}`} style={styles.section}>
      <Heading level={2}>{title}</Heading>
      {children}
    </View>
  );
}

/**
 * One public component: its name, an optional remark, and the groups of cases below. `includes`
 * names the other public parts the cases render through it (for example the slots of `Dialog`),
 * so the coverage list stays checkable against what is on screen.
 */
export function Component({
  name,
  note,
  includes,
  children,
}: {
  name: string;
  note?: string;
  includes?: readonly string[];
  children: ReactNode;
}) {
  return (
    <View style={styles.component}>
      <Heading level={3}>{name}</Heading>
      {note ? (
        <Text variant="body-sm" tone="secondary">
          {note}
        </Text>
      ) : null}
      {includes ? (
        <Text variant="body-sm" tone="secondary">
          {`Includes: ${includes.join(", ")}`}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

/** A labelled group of cases (for example "Sizes" or "States"), wrapping or stacked. */
export function Cases({
  label,
  layout = "row",
  children,
}: {
  label?: string;
  layout?: "row" | "column";
  children: ReactNode;
}) {
  return (
    <View style={styles.group}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View style={layout === "column" ? styles.casesColumn : styles.cases}>{children}</View>
    </View>
  );
}

/** One specimen with a caption saying which variant, size or state it shows. */
export function Case({
  label,
  scrollX = false,
  fill = false,
  children,
}: {
  label: string;
  /** Lets a part that cannot shrink (a table) scroll sideways instead of widening the screen. */
  scrollX?: boolean;
  /** Stretches the specimen to the width of the card, for parts that fill their row. */
  fill?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={fill || scrollX ? styles.caseBoxFull : styles.caseBox}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      {scrollX ? (
        <ScrollView horizontal nestedScrollEnabled>
          {children}
        </ScrollView>
      ) : (
        <View style={fill ? styles.caseBody : styles.caseBodyInline}>{children}</View>
      )}
    </View>
  );
}

/** One case per size S / M / L / XL. */
export function bySize(render: (size: ComponentSize) => ReactNode, sizes = SIZES) {
  return sizes.map((size) => (
    <Case key={size} label={`Size ${size}`}>
      {render(size)}
    </Case>
  ));
}

/** A screen-sized box for the parts that fill a screen (the layout patterns, the app frame). */
export function Frame({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  return <View style={styles.frame(height)}>{children}</View>;
}
