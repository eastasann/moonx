import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "../src/components/Link";
import { RouterProvider } from "../src/components/RouterProvider";

test("a link navigates through the router and shows the URL it maps to", async () => {
  const navigate = vi.fn();
  render(
    <RouterProvider navigate={navigate} useHref={(href) => `/app${href}`}>
      <Link href="/ideas">Ideas</Link>
    </RouterProvider>,
  );
  const link = screen.getByRole("link", { name: "Ideas" });
  expect(link).toHaveAttribute("href", "/app/ideas");
  await userEvent.click(link);
  expect(navigate).toHaveBeenCalledWith("/ideas");
});
