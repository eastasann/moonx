/**
 * Jest setup for code that renders `@moonx/ui-native`: the Unistyles stand-in, plus the mocks the
 * bottom sheet's native dependencies need. Used as `setupFiles` by this package and apps/mobile.
 */
jest.mock("react-native-unistyles", () => require("./unistyles-mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("react-native-worklets", () => require("react-native-worklets/lib/module/mock"));
jest.mock("@gorhom/bottom-sheet", () => ({
  ...jest.requireActual("@gorhom/bottom-sheet/mock"),
  BottomSheetModal: require("./bottom-sheet-mock").BottomSheetModal,
  BottomSheetFooter: ({ children }: { children: unknown }) => children,
}));
jest.mock(
  "react-native-safe-area-context",
  () => require("react-native-safe-area-context/jest/mock").default,
);
require("react-native-gesture-handler/jestSetup");
