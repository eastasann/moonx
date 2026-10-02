import type { Classification } from "@moonx/schemas";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { expect, test, vi } from "vitest";
import { FauControl, FauStatus } from "../src/components/FauControl";
import { i18n } from "../src/lib/i18n";
import { emptyClassification } from "./question-fixtures";

const classified = (partial: Partial<Classification>): Classification => ({
  ...emptyClassification(),
  ...partial,
});

function renderControl(
  classification: Classification,
  props: Partial<Parameters<typeof FauControl>[0]> = {},
) {
  const onChange = vi.fn();
  const onOpenEvidence = vi.fn();
  render(
    <I18nextProvider i18n={i18n}>
      <FauControl
        label="01 WHO"
        classification={classification}
        hasValue
        onChange={onChange}
        onOpenEvidence={onOpenEvidence}
        {...props}
      />
    </I18nextProvider>,
  );
  return { onChange, onOpenEvidence };
}

test("Assumption is not saved until a confidence is chosen", async () => {
  const { onChange } = renderControl(classified({ state: "unclassified" }));
  await userEvent.click(screen.getByRole("radio", { name: "Assumption" }));
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("radio", { name: "Medium" }));
  expect(onChange).toHaveBeenCalledWith({ fau: "assumption", confidence: "medium" });
});

test("pressing the chosen button again clears the classification", async () => {
  const { onChange } = renderControl(
    classified({ fau: "assumption", confidence: "low", state: "assumption" }),
  );
  await userEvent.click(screen.getByRole("radio", { name: "Assumption" }));
  expect(onChange).toHaveBeenCalledWith({ fau: null });
});

test("Fact opens the evidence sheet and changes nothing itself", async () => {
  const { onChange, onOpenEvidence } = renderControl(classified({ state: "unclassified" }));
  await userEvent.click(screen.getByRole("radio", { name: "Fact" }));
  expect(onOpenEvidence).toHaveBeenCalledTimes(1);
  expect(onChange).not.toHaveBeenCalled();
});

test("without a value only Unknown can be chosen", async () => {
  const { onChange } = renderControl(classified({}), { hasValue: false });
  expect(screen.getByRole("radio", { name: "Fact" })).toBeDisabled();
  expect(screen.getByRole("radio", { name: "Assumption" })).toBeDisabled();
  await userEvent.click(screen.getByRole("radio", { name: "Unknown" }));
  expect(onChange).toHaveBeenCalledWith({ fau: "unknown" });
});

test("a number with a value asks before Unknown clears it", async () => {
  const { onChange } = renderControl(classified({ state: "unclassified" }), {
    confirmUnknown: true,
  });
  await userEvent.click(screen.getByRole("radio", { name: "Unknown" }));
  expect(onChange).not.toHaveBeenCalled();
  expect(
    screen.getByText(/To keep the value, choose Assumption with Low confidence/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Clear and mark Unknown" }));
  expect(onChange).toHaveBeenCalledWith({ fau: "unknown" });
});

test("a read-only item shows the label and no buttons", () => {
  renderControl(classified({ fau: "assumption", confidence: "high", state: "assumption" }), {
    isReadOnly: true,
  });
  expect(screen.getByText("Assumption · High")).toBeInTheDocument();
  expect(screen.queryByRole("radio")).toBeNull();
});

test("the status label names Fact without evidence, and a Fact carries a chip for each piece of evidence", () => {
  const { rerender } = render(
    <I18nextProvider i18n={i18n}>
      <FauStatus classification={classified({ fau: "fact", state: "fact_no_evidence" })} />
    </I18nextProvider>,
  );
  expect(screen.getByText("Fact · No evidence")).toBeInTheDocument();
  rerender(
    <I18nextProvider i18n={i18n}>
      <FauStatus
        classification={classified({
          fau: "fact",
          state: "fact",
          evidence: [
            { id: "e1", kind: "url", researchLog: null, url: "https://psa.gov.ph", note: null },
          ],
        })}
      />
    </I18nextProvider>,
  );
  expect(screen.getByText("Fact")).toBeInTheDocument();
  expect(
    within(screen.getByRole("grid", { name: "Evidence" })).getByText("https://psa.gov.ph"),
  ).toBeInTheDocument();
});
