import { render, screen } from "@testing-library/react";
import { AppFrame } from "../src/components/AppFrame";
import { Breadcrumb, Breadcrumbs } from "../src/components/Breadcrumbs";
import { expectNoAxeViolations } from "./axe";

function Frame() {
  return (
    <AppFrame
      skipLabel="Skip to main content"
      sideNav={<nav aria-label="Main">side</nav>}
      tabBar={<nav aria-label="Tabs">tabs</nav>}
      breadcrumbs={
        <Breadcrumbs aria-label="Trail">
          <Breadcrumb href="/ideas">Ideas</Breadcrumb>
          <Breadcrumb>Piaya</Breadcrumb>
        </Breadcrumbs>
      }
      backLink={<a href="/ideas">Back</a>}
      title="Piaya"
      status={<span>Saved</span>}
      actions={<button type="button">Comments</button>}
      banner={<div role="status">Offline</div>}
    >
      <h1>Content</h1>
    </AppFrame>
  );
}

test("has a banner header, a main region and a skip link to it", () => {
  render(<Frame />);
  expect(screen.getByRole("banner")).toBeInTheDocument();
  const main = screen.getByRole("main");
  expect(main).toHaveAttribute("id", "main-content");
  expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute(
    "href",
    "#main-content",
  );
  expect(main).toContainElement(screen.getByRole("heading", { name: "Content" }));
});

test("places every slot", () => {
  render(<Frame />);
  const header = screen.getByRole("banner");
  for (const text of ["Saved", "Comments", "Piaya", "Back"]) {
    expect(header).toHaveTextContent(text);
  }
  expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Tabs" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("Offline");
});

test("has no axe violations", async () => {
  const { container } = render(<Frame />);
  await expectNoAxeViolations(container);
});

test("embedded, it adds no landmark and no skip link", () => {
  render(
    <AppFrame isEmbedded skipLabel="Skip to main content" sideNav={null} tabBar={null}>
      <p>Inside a page</p>
    </AppFrame>,
  );
  expect(screen.queryByRole("main")).toBeNull();
  expect(screen.queryByRole("link", { name: "Skip to main content" })).toBeNull();
});
