import type { UseQueryResult } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { QueryBoundary } from "../src/components/states";

const query = (fields: Partial<UseQueryResult<string>>) =>
  ({ refetch: async () => ({}), ...fields }) as UseQueryResult<string>;

test("a failed refetch keeps showing the data that is already there", () => {
  render(
    <QueryBoundary
      query={query({
        isPending: false,
        isError: true,
        data: "typed so far",
        error: new Error("x"),
      })}
      skeleton={null}
    >
      {(data) => <p>{data}</p>}
    </QueryBoundary>,
  );
  expect(screen.getByText("typed so far")).toBeInTheDocument();
});
