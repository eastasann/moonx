const preset = require("jest-expo/jest-preset");
const path = require("node:path");

// The preset's own list, widened to the native libraries and workspace packages that ship source.
const transformed =
  "@rn-primitives|lucide-react-native|@gorhom|react-native-unistyles|react-native-gesture-handler|react-native-worklets|@moonx";

/**
 * Jest settings for code that renders `@moonx/ui-native`: this package's tests and apps/mobile's.
 * Spread it into the jest-expo config.
 */
module.exports = {
  preset: "jest-expo",
  setupFiles: [path.join(__dirname, "setup.ts")],
  // The package's ESM entry is a .mjs file, which the preset does not transform.
  moduleNameMapper: {
    "^lucide-react-native$": require.resolve("lucide-react-native"),
  },
  transformIgnorePatterns: [
    preset.transformIgnorePatterns[0].replace("(?!(", `(?!(${transformed}|`),
    ...preset.transformIgnorePatterns.slice(1),
  ],
};
