import { waitFor } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect } from "vitest";

/**
 * Checks that `data-pressed` is set while a press is held and removed when it is released, for
 * the pointer and for the keyboard (Enter and Space).
 *
 * Why: asserting only that the attribute appears would pass for a component that never clears it,
 * and a stuck pressed style is the bug that shows up in the browser. jsdom does not hit-test, so
 * the pointer path presses and releases on the element itself; it cannot show the release after
 * the pointer has moved off the element or the cancel of a touch scroll, and those stay with the
 * browser-level checks (Playwright). The keyboard path holds the key with `{Key>}` and releases
 * it with `{/Key}`, which is the same sequence a person produces. Components whose press state
 * is not exposed as `data-pressed` (for example a Switch, which exposes it through its label)
 * must pass the element that carries the attribute.
 */
export async function expectPressedLifecycle(element: HTMLElement, user: UserEvent) {
  await expectPointerPressedLifecycle(element, user);
  element.focus();
  await expectKeyPressedLifecycle(element, user, "Enter");
  await expectKeyPressedLifecycle(element, user, "Space");
}

/**
 * The pointer half of {@link expectPressedLifecycle}, for components where releasing the press
 * has a side effect that replaces the element (a menu item closes its menu, a trigger opens its
 * popover), so each half needs its own render.
 */
export async function expectPointerPressedLifecycle(element: HTMLElement, user: UserEvent) {
  expect(element).not.toHaveAttribute("data-pressed");
  await user.pointer({ keys: "[MouseLeft>]", target: element });
  expect(element).toHaveAttribute("data-pressed");
  await user.pointer({ keys: "[/MouseLeft]" });
  expect(element).not.toHaveAttribute("data-pressed");
}

/** The keyboard half of {@link expectPressedLifecycle}; the element must already have focus. */
export async function expectKeyPressedLifecycle(
  element: HTMLElement,
  user: UserEvent,
  key: "Enter" | "Space",
) {
  expect(element).not.toHaveAttribute("data-pressed");
  await user.keyboard(key === "Enter" ? "{Enter>}" : "[Space>]");
  expect(element, `${key} held`).toHaveAttribute("data-pressed");
  await user.keyboard(key === "Enter" ? "{/Enter}" : "[/Space]");
  expect(element, `${key} released`).not.toHaveAttribute("data-pressed");
}

/**
 * `data-pressed` on the trigger of a popover, menu or dialog: set while the press is held, kept
 * while the overlay is open, removed when Escape closes it.
 *
 * Why: react-aria's trigger passes `isPressed` = open to its button, so the trigger stays pressed
 * for as long as its overlay is open. Asserting the plain press-and-release sequence on such a
 * trigger fails on the release, which is the intended behaviour. This checks all three steps so a
 * trigger that never clears the state after the overlay closes is still caught.
 */
export async function expectOverlayTriggerPressedLifecycle(
  trigger: HTMLElement,
  user: UserEvent,
  way: "pointer" | "Enter" | "Space",
) {
  expect(trigger).not.toHaveAttribute("data-pressed");
  if (way === "pointer") {
    await user.pointer({ keys: "[MouseLeft>]", target: trigger });
  } else {
    trigger.focus();
    await user.keyboard(way === "Enter" ? "{Enter>}" : "[Space>]");
  }
  expect(trigger, `${way} held`).toHaveAttribute("data-pressed");
  if (way === "pointer") {
    await user.pointer({ keys: "[/MouseLeft]" });
  } else {
    await user.keyboard(way === "Enter" ? "{/Enter}" : "[/Space]");
  }
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
  expect(trigger, "open").toHaveAttribute("data-pressed");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  expect(trigger, "closed").not.toHaveAttribute("data-pressed");
}

/**
 * `data-pressed` is removed when the pointer leaves the element while the button is still held,
 * and the press does not activate.
 *
 * Why: for controls whose release replaces the element (a close button, a menu item), the plain
 * release cannot show the attribute going away because the node is gone by then. Leaving with the
 * button down is the way to see the state clear on a node that is still mounted. Returns after the
 * button is released, so the caller can assert that nothing was activated.
 */
export async function expectPressedClearsOnLeave(element: HTMLElement, user: UserEvent) {
  expect(element).not.toHaveAttribute("data-pressed");
  await user.pointer({ keys: "[MouseLeft>]", target: element });
  expect(element).toHaveAttribute("data-pressed");
  await user.pointer({ target: document.body });
  expect(element).not.toHaveAttribute("data-pressed");
  await user.pointer({ keys: "[/MouseLeft]" });
}
