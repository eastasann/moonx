module.exports = (api) => {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // `root` is the screens' folder; the parts live in a workspace package, so it is listed too.
      ["react-native-unistyles/plugin", { root: "app", autoProcessPaths: ["packages/ui-native"] }],
    ],
  };
};
