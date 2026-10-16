import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Container } from "./Container";
import { Flex, Stack } from "./Flex";
import { Grid } from "./Grid";

const classOf = (element: HTMLElement) => element.className.split(" ").sort();
const byId = (id: string) => document.getElementById(id) as HTMLElement;

describe("Flex", () => {
  test("renders the requested element with its DOM props, and no style", () => {
    render(
      <Flex elementType="nav" aria-label="Sections" gap="space-200">
        child
      </Flex>,
    );
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(nav.getAttribute("style")).toBeNull();
    expect(nav.textContent).toBe("child");
  });

  test("each gap token gets its own class, and breakpoints add classes", () => {
    render(
      <>
        <Flex id="a" gap="space-100" />
        <Flex id="b" gap="space-300" />
        <Flex id="c" gap={{ mobile: "space-100", desktop: "space-300" }} />
      </>,
    );
    const [a, b, c] = [byId("a"), byId("b"), byId("c")];
    expect(classOf(a)).not.toEqual(classOf(b));
    // The responsive value carries the mobile class plus a desktop one.
    for (const name of classOf(a)) expect(classOf(c)).toContain(name);
    expect(classOf(c).length).toBeGreaterThan(classOf(a).length);
  });

  test("wrap and direction change the classes", () => {
    render(
      <>
        <Flex id="row" />
        <Flex id="column" direction="column" wrap />
      </>,
    );
    expect(classOf(document.getElementById("row") as HTMLElement)).not.toEqual(
      classOf(document.getElementById("column") as HTMLElement),
    );
  });

  test("Stack is a Flex column", () => {
    render(
      <>
        <Stack elementType="ul" gap="space-200">
          <li>one</li>
        </Stack>
        <Flex elementType="ol" direction="column" gap="space-200">
          <li>two</li>
        </Flex>
      </>,
    );
    const [stack, flex] = screen.getAllByRole("list");
    expect(classOf(stack as HTMLElement)).toEqual(classOf(flex as HTMLElement));
  });
});

describe("Grid", () => {
  test("columns and gaps by breakpoint are classes", () => {
    render(
      <>
        <Grid id="one" />
        <Grid id="responsive" columns={{ mobile: 1, tablet: 2, desktop: 4 }} />
      </>,
    );
    const one = classOf(document.getElementById("one") as HTMLElement);
    const responsive = classOf(
      document.getElementById("responsive") as HTMLElement,
    );
    expect(responsive.length).toBe(one.length + 2);
  });
});

describe("Container", () => {
  test("reading and content widths, gutters on or off", () => {
    render(
      <>
        <Container id="content" />
        <Container id="reading" width="reading" />
        <Container id="bare" hasGutters={false} elementType="main" />
      </>,
    );
    const content = classOf(document.getElementById("content") as HTMLElement);
    expect(content).not.toEqual(
      classOf(document.getElementById("reading") as HTMLElement),
    );
    expect(content).not.toEqual(
      classOf(document.getElementById("bare") as HTMLElement),
    );
    expect(screen.getByRole("main").id).toBe("bare");
  });
});
