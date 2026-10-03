import { LucideProvider } from "lucide-react-native";
import { Children, type ReactNode } from "react";
import { Text, type TextStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";

interface ContentProps {
  children: ReactNode;
  /** Style of the text nodes. Also gives the icons their color unless `iconColor` is set. */
  textStyle: TextStyle & { color?: string };
  /** Pixel size for the Lucide icons inside; the stroke width comes from `semantic.icon`. */
  iconSize: number;
  iconColor?: string;
}

/**
 * The inside of a pressable or label: bare strings (which React Native only allows inside
 * `Text`) are wrapped, and Lucide icons placed among the children take the color and size of
 * the surrounding part, as `currentColor` does on the Web.
 */
export function Content({ children, textStyle, iconSize, iconColor }: ContentProps) {
  const { theme } = useUnistyles();
  const color = iconColor ?? textStyle.color;
  return (
    <LucideProvider size={iconSize} color={color} strokeWidth={theme.icon["stroke-width"]}>
      {Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number" ? (
          <Text style={textStyle}>{child}</Text>
        ) : (
          child
        ),
      )}
    </LucideProvider>
  );
}
