import axe from "axe-core";

/**
 * Runs axe on a rendered container and throws with the violations listed. `color-contrast` is off
 * because jsdom has no layout; the token pairs are checked by packages/ui-tokens (contrast.ts).
 */
export async function expectNoAxeViolations(container: Element) {
  const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  const lines = result.violations.map(
    (v) => `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.html}`).join("\n")}`,
  );
  if (lines.length > 0) throw new Error(`axe violations:\n${lines.join("\n")}`);
}
