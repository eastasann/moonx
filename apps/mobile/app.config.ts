import type { ExpoConfig } from "expo/config";

const appEnv = process.env.EXPO_PUBLIC_APP_ENV ?? "local";
const isStaging = appEnv === "staging";

// The New Architecture is always on in this SDK, so there is no flag to set (ADR-003).
const config: ExpoConfig = {
  name: isStaging ? "moonx (staging)" : "moonx",
  slug: "moonx",
  scheme: isStaging ? "moonx-staging" : "moonx",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  plugins: ["expo-router"],
  experiments: { typedRoutes: true },
};

export default config;
