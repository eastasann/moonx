/**
 * Whether the browser runs on macOS: the platform it reports starts with "Mac", the test
 * React Aria makes (its own check is not public). iPadOS reports a Mac too, and is told
 * apart by its touch points, as React Aria does.
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const { userAgentData } = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = userAgentData?.platform || navigator.platform;
  return /^Mac/i.test(platform) && navigator.maxTouchPoints <= 1;
}
