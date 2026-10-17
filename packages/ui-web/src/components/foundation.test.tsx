import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Button } from "./Button";
import { Divider } from "./Divider";
import { Form } from "./Form";
import { Heading } from "./Heading";
import { Link } from "./Link";
import { ProgressCircle } from "./ProgressCircle";
import { Text } from "./Text";
import { TextField } from "./TextField";
import { Well } from "./Well";

describe("Heading", () => {
  test("renders h1 to h4 by level", () => {
    render(
      <div>
        {([1, 2, 3, 4] as const).map((level) => (
          <Heading key={level} level={level}>
            Level {level}
          </Heading>
        ))}
      </div>,
    );
    for (const level of [1, 2, 3, 4]) {
      expect(
        screen.getByRole("heading", { level, name: `Level ${level}` }).tagName,
      ).toBe(`H${level}`);
    }
  });

  test("display and label change the look, not the level", () => {
    render(
      <>
        <Heading level={2}>Plain</Heading>
        <Heading level={2} variant="display">
          Display
        </Heading>
        <Heading level={2} variant="label">
          Label
        </Heading>
      </>,
    );
    const classes = ["Plain", "Display", "Label"].map(
      (name) => screen.getByRole("heading", { level: 2, name }).className,
    );
    expect(new Set(classes).size).toBe(3);
  });
});

describe("Text", () => {
  test("variants and tones are distinct, the element is a span unless asked", () => {
    render(
      <>
        <Text>Body</Text>
        <Text variant="number">₱1,000</Text>
        <Text tone="negative" elementType="p">
          Error
        </Text>
      </>,
    );
    expect(screen.getByText("Body").tagName).toBe("SPAN");
    expect(screen.getByText("Error").tagName).toBe("P");
    expect(screen.getByText("Body").className).not.toBe(
      screen.getByText("₱1,000").className,
    );
    expect(screen.getByText("Body").className).not.toBe(
      screen.getByText("Error").className,
    );
  });
});

describe("Divider", () => {
  test("is a separator; vertical ones say so", () => {
    render(
      <>
        <Divider size="L" />
        <Divider orientation="vertical" />
      </>,
    );
    const [horizontal, vertical] = screen.getAllByRole("separator");
    expect(horizontal?.getAttribute("aria-orientation")).not.toBe("vertical");
    expect(vertical?.getAttribute("aria-orientation")).toBe("vertical");
  });
});

describe("Well", () => {
  test("can be a labelled region", () => {
    render(
      <Well role="region" aria-label="Decision material" density="spacious">
        Material
      </Well>,
    );
    expect(
      screen.getByRole("region", { name: "Decision material" }).textContent,
    ).toBe("Material");
  });
});

describe("Link", () => {
  test("is a link that keyboard and pointer can follow", async () => {
    const onPress = vi.fn();
    const user = userEvent.setup();
    render(<Link onPress={onPress}>See all decisions</Link>);
    const link = screen.getByRole("link", { name: "See all decisions" });
    await user.tab();
    expect(link.getAttribute("data-focus-visible")).toBe("true");
    await user.keyboard("{Enter}");
    await user.click(link);
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  test("primary and secondary look different; disabled is announced", () => {
    render(
      <>
        <Link href="/a">Primary</Link>
        <Link href="/b" variant="secondary">
          Secondary
        </Link>
        <Link isDisabled>Disabled</Link>
      </>,
    );
    expect(screen.getByRole("link", { name: "Primary" }).className).not.toBe(
      screen.getByRole("link", { name: "Secondary" }).className,
    );
    expect(
      screen
        .getByRole("link", { name: "Disabled" })
        .getAttribute("aria-disabled"),
    ).toBe("true");
  });
});

describe("Form", () => {
  test("shows each field's reason by name and never lets the browser submit", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <Form
        validationErrors={{ ideaName: "Enter a name." }}
        onSubmit={onSubmit}
      >
        <TextField name="ideaName" label="Idea name" />
        <Button type="submit">Save</Button>
      </Form>,
    );
    const field = screen.getByRole("textbox", { name: "Idea name" });
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const error = screen.getByText("Enter a name.");
    expect(field.getAttribute("aria-describedby")).toContain(
      error.closest("[id]")?.id,
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0].defaultPrevented).toBe(true);
  });

  test("the browser's own checks are off", () => {
    render(
      <Form>
        <TextField name="email" label="Email" type="email" isRequired />
      </Form>,
    );
    const form = screen.getByRole("textbox").closest("form") as HTMLFormElement;
    expect(form.noValidate).toBe(true);
    const event = fireEvent.submit(form);
    expect(event).toBe(false);
    expect(screen.getByRole("textbox").getAttribute("aria-invalid")).toBeNull();
  });

  test("size sets the fields' size over the density's", () => {
    render(
      <div>
        <Form density="spacious" size="S" aria-label="Small">
          <TextField label="Small field" />
        </Form>
        <TextField label="S field" size="S" />
      </div>,
    );
    const rootOf = (name: string) =>
      screen.getByRole("textbox", { name }).parentElement?.parentElement;
    expect(rootOf("Small field")?.className).toBe(rootOf("S field")?.className);
  });

  test("spacious makes fields and buttons L, regular M", () => {
    render(
      <>
        <Form density="spacious" aria-label="Spacious">
          <TextField label="Spacious field" />
          <Button>Spacious button</Button>
        </Form>
        <TextField label="L field" size="L" />
        <Button size="L">L button</Button>
        <Form aria-label="Regular">
          <TextField label="Regular field" />
        </Form>
        <TextField label="M field" />
      </>,
    );
    const rootOf = (name: string) =>
      screen.getByRole("textbox", { name }).closest(".react-aria-TextField") ??
      screen.getByRole("textbox", { name }).parentElement?.parentElement;
    expect(rootOf("Spacious field")?.className).toBe(
      rootOf("L field")?.className,
    );
    expect(rootOf("Regular field")?.className).toBe(
      rootOf("M field")?.className,
    );
    expect(
      screen.getByRole("button", { name: "Spacious button" }).className,
    ).toBe(screen.getByRole("button", { name: "L button" }).className);
  });
});

describe("ProgressCircle", () => {
  test("reports its value in en-PH", () => {
    render(<ProgressCircle value={40} aria-label="Uploading" />);
    const bar = screen.getByRole("progressbar", { name: "Uploading" });
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuetext")).toBe("40%");
  });

  test("indeterminate has no value; sizes differ", () => {
    render(
      <>
        <ProgressCircle isIndeterminate size="S" aria-label="Small" />
        <ProgressCircle isIndeterminate size="L" aria-label="Large" />
      </>,
    );
    const small = screen.getByRole("progressbar", { name: "Small" });
    expect(small.getAttribute("aria-valuenow")).toBeNull();
    expect(small.className).not.toBe(
      screen.getByRole("progressbar", { name: "Large" }).className,
    );
  });
});
