import { createI18n } from "@moonx/i18n";
import { act, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { Breadcrumb, Breadcrumbs } from "./Breadcrumbs";

// The parts take their words through react-i18next (SDD ADR-026・9章): from the instance
// the app gives it, and again when its language changes.

test("a part reads the app's instance and follows a change of its language", async () => {
  const instance = createI18n();
  render(
    <I18nextProvider i18n={instance}>
      <Breadcrumbs>
        <Breadcrumb href="/ideas">Ideas</Breadcrumb>
        <Breadcrumb>Piaya Gift Box</Breadcrumb>
      </Breadcrumbs>
    </I18nextProvider>,
  );
  expect(
    screen.getByRole("list", {
      name: instance.t("components:breadcrumbs.label"),
    }),
  ).toBeTruthy();

  // New words, then a change of language (to English again: the only catalog there is).
  // The parts render again with the words of the language changed to.
  instance.addResourceBundle("en", "components", {
    breadcrumbs: { label: "Where you are" },
  });
  await act(async () => {
    await instance.changeLanguage("en");
  });
  expect(screen.getByRole("list", { name: "Where you are" })).toBeTruthy();
});
