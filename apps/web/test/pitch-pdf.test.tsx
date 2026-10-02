import { screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { openPitch, PDF_PATH, PITCH_URL, VERSION } from "./support-pitch";

let clicked: { download: string; href: string }[] = [];

beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => "blob:pdf");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ download: this.download, href: this.href });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Wraps the stubbed fetch so P13 answers with a Blob and the headers the server sets. */
function pdfFetch(
  answer: () => Response | Promise<Response>,
  seen: { url: string; init?: RequestInit }[] = [],
) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(PDF_PATH)) {
      seen.push({ url: String(input), init });
      return answer();
    }
    return inner(input, init);
  });
  return seen;
}

const pdf = () =>
  new Response("%PDF-1.7", {
    headers: {
      "content-type": "application/pdf",
      "content-disposition":
        "attachment; filename=\"Piaya-Box-one-draft-2026-10-01.pdf\"; filename*=UTF-8''Piaya%20Box-one-draft-2026-10-01.pdf",
    },
  });

test("Download PDF fetches P13 as a Blob and saves it under the server's file name", async () => {
  const { user } = await openPitch();
  const seen = pdfFetch(pdf);
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]?.download).toBe("Piaya Box-one-draft-2026-10-01.pdf");
  expect(seen[0]?.url).toBe(`${PDF_PATH}?variant=one`);
  expect(seen[0]?.init).toMatchObject({
    credentials: "same-origin",
    headers: { "X-Moonx-Client": "web" },
  });
});

test("the PDF of a version and of the five-minute deck carries both in the query", async () => {
  const { user } = await openPitch({ path: `${PITCH_URL}?variant=five&version=${VERSION}` });
  const seen = pdfFetch(pdf);
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(seen[0]?.url).toBe(`${PDF_PATH}?variant=five&versionId=${VERSION}`);
});

test("the button is disabled with Preparing PDF… while the PDF renders", async () => {
  const { user } = await openPitch();
  const gate = Promise.withResolvers<Response>();
  pdfFetch(() => gate.promise);
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  const pending = await screen.findByRole("button", { name: /Preparing PDF…/ });
  expect(pending).toHaveAttribute("aria-disabled", "true");
  gate.resolve(pdf());
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(await screen.findByRole("button", { name: "Download PDF" })).toBeInTheDocument();
});

test("a failed PDF shows the catalog error and Retry runs it again", async () => {
  const { user } = await openPitch();
  let fail = true;
  const seen = pdfFetch(() =>
    fail
      ? Response.json(
          { error: { code: "UPSTREAM_UNAVAILABLE", message: "x", requestId: "abcdef12-0000" } },
          { status: 503 },
        )
      : pdf(),
  );
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  expect(await screen.findByText("Couldn't prepare the PDF")).toBeInTheDocument();
  expect(clicked).toHaveLength(0);
  fail = false;
  await user.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(seen).toHaveLength(2);
  expect(screen.queryByText("Couldn't prepare the PDF")).toBeNull();
});

test("a rate-limited PDF shows the catalog text for RATE_LIMITED", async () => {
  const { user } = await openPitch();
  pdfFetch(() =>
    Response.json(
      { error: { code: "RATE_LIMITED", message: "x", requestId: "abcdef12-0000" } },
      { status: 429 },
    ),
  );
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  expect(await screen.findByText("Too many attempts. Try again in a minute.")).toBeInTheDocument();
});

test("no answer at all is reported as a failed PDF", async () => {
  const { user } = await openPitch();
  pdfFetch(() => {
    throw new TypeError("offline");
  });
  await user.click(await screen.findByRole("button", { name: "Download PDF" }));
  expect(await screen.findByText("Couldn't prepare the PDF")).toBeInTheDocument();
});
