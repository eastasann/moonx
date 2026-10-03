declare module "*.ttf" {
  /** Metro resolves a bundled font to an asset id that `expo-font` accepts. */
  const source: number;
  export default source;
}
