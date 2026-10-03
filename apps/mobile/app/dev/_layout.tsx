import { Redirect, Stack } from "expo-router";

/** The `/dev/*` routes exist only in a development build; any other build sends them home. */
export default function DevLayout() {
  if (!__DEV__) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
