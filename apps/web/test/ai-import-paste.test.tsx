import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  importPath,
  matchRows,
  paste,
  pressNext,
  registerAiHooks,
  VALIDATION,
} from "./support-ai";

registerAiHooks();

const PATH = importPath(`target=validation&id=${VALIDATION}`);

test("the paste step starts empty with Next off and an upload button", async () => {
  api();
  await renderApp(PATH);
  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Import from AI — Piaya Gift Box Delivery",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "AI reply" })).toHaveValue("");
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Upload .md / .json" })).toBeInTheDocument();
});

test("a paste with no question IDs shows the format and can go on as one block", async () => {
  api();
  await renderApp(PATH);
  await paste("Customer segments are BPO firms in Bacolod.");
  await pressNext();
  expect(await screen.findByText("No question IDs found")).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "Example of a reply" })).toHaveTextContent(
    "## [V.01.WHO]",
  );
  expect(screen.queryByRole("list", { name: "Match" })).toBeNull();

  await userEvent.click(
    screen.getByRole("button", { name: "Continue with the whole paste as one block" }),
  );
  const [block] = matchRows();
  expect(block).toHaveTextContent("Not matched");
  expect(block).toHaveTextContent("Customer segments are BPO firms in Bacolod.");
});

test("a paste over 200,000 characters is refused before anything is read", async () => {
  api();
  await renderApp(PATH);
  await paste(`## [V.01.WHO]\n${"x".repeat(200_000)}`);
  expect(
    await screen.findByText("This is too long. Import fewer questions at a time."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await paste("## [V.01.WHO]\nshort again");
  expect(screen.queryByText("This is too long. Import fewer questions at a time.")).toBeNull();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;

test("a .md file fills the paste field", async () => {
  api();
  await renderApp(PATH);
  await screen.findByRole("textbox", { name: "AI reply" });
  await userEvent.upload(
    fileInput(),
    new File(["## [V.01.WHO]\nFrom a file"], "reply.md", { type: "text/markdown" }),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "AI reply" })).toHaveValue(
      "## [V.01.WHO]\nFrom a file",
    ),
  );
  await pressNext();
  expect(matchRows()[0]).toHaveTextContent("From a file");
});

test("a file over 1 MB is refused", async () => {
  api();
  await renderApp(PATH);
  await screen.findByRole("textbox", { name: "AI reply" });
  await userEvent.upload(
    fileInput(),
    new File(["x".repeat(1_000_001)], "big.json", { type: "application/json" }),
  );
  expect(
    await screen.findByText("This is too long. Import fewer questions at a time."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
