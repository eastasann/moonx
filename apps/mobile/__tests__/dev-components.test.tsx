import { act, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";
import RootLayout from "../app/_layout";
import DevLayout from "../app/dev/_layout";
import ComponentsRoute from "../app/dev/components";
import Landing from "../app/index";

const routes = {
  _layout: RootLayout,
  index: Landing,
  "dev/_layout": DevLayout,
  "dev/components": ComponentsRoute,
};

/** The route table of the app, with the real route modules. */
async function open(url: string) {
  const router = renderRouter(routes, { initialUrl: url });
  await act(async () => {});
  return router;
}

test("/dev/components shows the component gallery in a development build", async () => {
  await open("/dev/components");
  expect(screen.getByTestId("component-gallery")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Component gallery" })).toBeTruthy();
  expect(screen.getByLabelText("Theme")).toBeTruthy();
});

describe("outside a development build", () => {
  beforeEach(() => {
    jest.replaceProperty(globalThis as { __DEV__?: boolean }, "__DEV__", false);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("/dev/components redirects to the landing route", async () => {
    const router = await open("/dev/components");
    expect(router.getPathname()).toBe("/");
    expect(screen.queryByTestId("component-gallery")).toBeNull();
    expect(screen.getByTestId("landing")).toBeTruthy();
  });
});
